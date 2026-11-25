'use strict'
// Infraestructura compartida del procés principal: requires d'Electron i Node, confiança dels missatges IPC, logs, errors, configuració i gestors.
// Mòdul del procés principal d'Electron (abans tot era a index.js). Registra els seus handlers IPC en carregar-se.

// Requirements
const { app, BrowserWindow, dialog, ipcMain, Menu, nativeTheme, shell, utilityProcess } = require('electron')
const autoUpdater = require('electron-updater').autoUpdater
const fs = require('fs')
const isDev = require('../../app/assets/js/isdev')
const os = require('os')
const path = require('path')
const semver = require('semver')
const { pathToFileURL } = require('url')
const { AZURE_CLIENT_ID, MSFT_OPCODE, MSFT_REPLY_TYPE, MSFT_ERROR } = require('../../app/assets/js/ipcconstants')

/** Arrel del projecte (on són `app/`, `renderer-dist/`, `runtime/`…): aquests mòduls viuen a `src-node/main/`. */
const ROOT = path.join(__dirname, '..', '..')

const Security = require('../../app/assets/js/security')
/** S4: ids de versió/servidor que vénen del renderer (mai camins ni text lliure). */
function assertId(id, { nullable = false } = {}) {
    if (nullable && id == null) return
    if (!Security.isValidId(id)) throw new Error('INVALID_ID')
}

// S4: només la finestra principal (renderer-dist o el servidor de Vite en dev) pot cridar els handlers IPC. Les finestres
// de Microsoft (contingut remot) no hi tenen accés encara que compartissin procés.
const RENDERER_ORIGIN = pathToFileURL(path.join(ROOT, 'renderer-dist')).toString().toLowerCase()
function isTrustedSender(event) {
    const url = String(event?.senderFrame?.url ?? '').toLowerCase()
    if (process.env.RENDERER_DEV_SERVER === '1' && url.startsWith('http://localhost:5173')) return true
    return url.startsWith(RENDERER_ORIGIN)
}
const rawHandle = ipcMain.handle.bind(ipcMain)
ipcMain.handle = (channel, listener) => rawHandle(channel, (event, ...args) => {
    if (!isTrustedSender(event)) throw new Error(`Untrusted IPC sender for ${channel}`)
    return listener(event, ...args)
})
const rawOn = ipcMain.on.bind(ipcMain)
ipcMain.on = (channel, listener) => rawOn(channel, (event, ...args) => {
    // Les finestres de Microsoft (OPEN_LOGIN/OPEN_LOGOUT) només es demanen des del renderer principal; es descarta la resta.
    if (!isTrustedSender(event)) return
    listener(event, ...args)
})

// O2: log persistent (`userData/logs/launcher.log`, rotatiu i sense credencials). El més aviat possible per no perdre res.
const AppLog = require('../../app/assets/js/applog')
AppLog.install(path.join(app.getPath('userData'), 'logs'))
// Informes d'errors (plans/08): el mòdul es crea més avall, quan ja hi ha la config; fins llavors `report` no fa res.
let ErrorReports = null
function reportError(kind, errLike, extra = {}) {
    try {
        const err = errLike instanceof Error ? errLike : null
        void ErrorReports?.capture({
            kind,
            name: err?.name ?? extra.name ?? 'Error',
            message: err?.message ?? (typeof errLike === 'string' ? errLike : extra.message ?? String(errLike)),
            stack: err?.stack ?? '',
            ...extra
        })
    } catch { /* informar d'un error mai en pot provocar un altre */ }
}
// Errors no capturats: es registren (sense el diàleg natiu d'Electron) i l'app continua.
process.on('uncaughtException', (err) => {
    console.error('[main] uncaughtException', err)
    reportError('main', err, { severe: true })
})
process.on('unhandledRejection', (reason) => {
    console.error('[main] unhandledRejection', reason)
    reportError('main', reason, { severe: true, name: 'UnhandledRejection' })
})
// Language-aware reload
const ConfigManager = require('../../app/assets/js/configmanager')
// Abans ho feia, de passada, `LangLoader.setupLanguage()`; sense config carregada, els getters
// (`getCommonDirectory`…) petarien en arrencar.
ConfigManager.load()

// 2.1: serveis reals per `window.hellmc` (finestra de proves del renderer nou) — reutilitzen la
// mateixa lògica que ja fa servir l'app antiga, mai reimplementada, només
// re-exposada via IPC perquè el preload nou és sandboxed (sense accés directe a mòduls Node).
//
// Log de debug **només en dev** (petició de l'usuari arran de dos bugs seguits difícils de
// diagnosticar sense veure valors reals — `javaConfig`/`modConfigurations` no inicialitzats,
// `java.detect` desant l'arrel del JDK en comptes de l'executable): `LoggerUtil` sempre escriu a
// consola (no filtra per entorn, `hellmc-core/dist/util/LoggerUtil.js:35`), per això cal el propi
// `if (isDev)` explícit a cada crida, no n'hi ha prou amb el logger sol.
const { LoggerUtil } = require('hellmc-core')
const ipcLogger = LoggerUtil.getLogger('HellMCIpc')
function devLog(...args) {
    if (isDev) ipcLogger.debug(...args)
}
const AuthManager = require('../../app/assets/js/authmanager')
const DistroManager = require('../../app/assets/js/distromanager')
const { DistroAPI, SIGNING_KEYS } = DistroManager
const ProcessBuilder = require('../../app/assets/js/processbuilder')
const DataSharing = require('../../app/assets/js/datasharing')
const ServersDat = require('../../app/assets/js/serversdat')
const { FullRepair, DistributionIndexProcessor, MojangIndexProcessor, downloadFile } = require('hellmc-core/dl')
// B23/S10: el receptor de descàrregues corre en un `utilityProcess` (no `fork` sobre el binari amb `RunAsNode`).
// `utilityProcess.fork` només es crida en llançar (app ja llesta); aquí només s'injecta l'estratègia.
require('../receiverSpawner').installReceiverSpawner(FullRepair, utilityProcess)
const { createEtaEstimator } = require('../downloadEta')
// 2.3 (JDK auto-download): `validateLocalFile` viu a `hellmc-core/common` (no a `hellmc-core/dl`
// amb la resta d'utilitats de descàrrega) — mateix mòdul que `FullRepair`.
const { validateLocalFile } = require('hellmc-core/common')
// 2.2: ping directe de servidors (P8, `09-fases-i-proves.md`) — sense passar per cap API externa
// (l'estat és sempre una consulta al propi servidor, mai al servei d'estat). `minecraft-server-util`
// original està abandonat («no longer maintained», avís d'npm); `mcstatus-util` n'és el fork actiu
// mantingut per la comunitat (`MCStatusBot`), mateixa API de `status()`.
const { status: pingJavaServer, parseAddress } = require('mcstatus-util')
// 2.3 (Mods): mateix `Type` que `processbuilder.js` ja fa servir per triar quins mòduls compten
// com a "mod" (ForgeMod/LiteMod/LiteLoader/FabricMod) — mai un enum propi duplicat.
const { Type } = require('hellmc-distribution-types')
// 2.4 (bàsic): lectura de RSS. L'app antiga ho fa amb jQuery (`$.ajax` + `$(dades).find(...)`, DOM
// de la finestra) — inservible des d'aquí (procés principal, sense DOM). `rss-parser` és qui
// s'encarrega de l'XML; la lògica de selecció de feeds (global + del servidor) és nostra.
const RssParser = require('rss-parser')
// 07 §5: timeout de 8s. Límit de mida no aplicat (`rss-parser` no exposa cap opció per fer-ho
// directament, caldria un `fetch` propi al davant només per aquesta comprovació) — deixat fora
// d'abast, documentat, no oblidat.
const rssParser = new RssParser({ timeout: 8000 })
// 2.3: Java i gestió d'instal·lació de versions — mateixes utilitats que `preload-bridge.js` ja
// requeria per a la UI antiga (`discoverBestJvmInstallation`/`isJavaExecPath`/`javaExecFromRoot`/
// `ensureJavaDirIsRoot`/`validateSelectedJvm`), mai reimplementades.
const {
    discoverBestJvmInstallation,
    validateSelectedJvm,
    isJavaExecPath,
    javaExecFromRoot,
    ensureJavaDirIsRoot,
    latestOpenJDK,
    extractJdk,
    // 2.5 (Configuració > Java, «versions de Java detectades»): a diferència de
    // `discoverBestJvmInstallation` (la millor per a UNA versió concreta), aquestes donen la llista
    // sencera de JVMs trobades al sistema — exactament les mateixes funcions que
    // `discoverBestJvmInstallation` crida per dins (`JavaGuard.js`), exposades soles.
    getValidatableJavaPaths,
    resolveJvmSettings,
    filterApplicableJavaPaths,
    rankApplicableJvms
} = require('hellmc-core/java')

// `DistroAPI` (singleton de
// `distromanager.js`) necessita `commonDir`/`instanceDir` abans de la primera crida a
// `getDistribution()`, i `distromanager.js` els deixa `null` a propòsit (s'injecten aquí,
// un cop en arrencar).
DistroAPI['commonDir'] = ConfigManager.getCommonDirectory()
DistroAPI['instanceDir'] = ConfigManager.getInstanceDirectory()
// S3: només http(s) (mai `file:`/manejadors de protocol) i només carpetes dins de les dades del launcher.
function openExternalSafely(rawUrl) {
    const url = Security.safeExternalUrl(rawUrl)
    if (url == null) {
        console.warn('[main] blocked external URL', String(rawUrl).slice(0, 200))
        return Promise.resolve()
    }
    return shell.openExternal(url)
}
// O2: carpeta de logs i informe de diagnòstic (sense credencials: `AppLog.tailFile` redacta) per demanar suport.
// D15/D8: termes, política de privacitat i consentiment de telemetria (separat). `CURRENT_TERMS_VERSION` puja quan canvien
// els textos: tothom torna a veure la pantalla (sense login si ja hi ha sessió).
const CURRENT_TERMS_VERSION = 2
// Telemetria opt-in (docs/web-i-telemetria): l'identificador anònim mai surt del procés principal.
const Telemetry = require('../../app/assets/js/telemetry').create({
    getLegal: () => ConfigManager.getLegal(),
    setLegal: (patch) => ConfigManager.setLegal(patch),
    save: () => ConfigManager.save(),
    termsVersion: () => CURRENT_TERMS_VERSION,
    appVersion: app.getVersion(),
    platform: process.platform,
    isDev
})
// Informes d'errors opt-in (plans/08): la neteja i la cua viuen a `errorReports.js`; el renderer no té xarxa i només hi arriba per IPC.
ErrorReports = require('../../app/assets/js/errorReports').create({
    getLegal: () => ConfigManager.getLegal(),
    setLegal: (patch) => ConfigManager.setLegal(patch),
    save: () => ConfigManager.save(),
    termsVersion: () => CURRENT_TERMS_VERSION,
    appVersion: app.getVersion(),
    platform: process.platform,
    osVersion: os.release(),
    arch: process.arch,
    electronVersion: process.versions.electron,
    isDev,
    queueFile: path.join(app.getPath('userData'), 'error-queue.json'),
    getLastLog: () => AppLog.tailFile(AppLog.getLogFile(), 40),
    // Rutes i noms que no han de sortir mai: la instància i les carpetes de dades, el perfil de l'usuari i els jugadors coneguts.
    getContext: () => {
        const replacements = []
        const add = (fn, label) => { try { const p = fn(); if (typeof p === 'string' && p !== '') replacements.push([p, label]) } catch { /* encara no hi ha config */ } }
        add(() => ConfigManager.getInstanceDirectory(), '<instance>')
        add(() => ConfigManager.getCommonDirectory(), '<common>')
        add(() => ConfigManager.getDataDirectory(), '<data>')
        add(() => ConfigManager.getLauncherDirectory(), '<launcher>')
        add(() => app.getPath('userData'), '<userData>')
        add(() => app.getAppPath(), '<app>')
        add(() => process.resourcesPath, '<app>')
        add(() => os.tmpdir(), '<tmp>')
        add(() => os.homedir(), '~')
        const names = []
        try {
            for (const account of Object.values(ConfigManager.getAuthAccounts() ?? {})) names.push(account?.displayName, account?.username)
        } catch { /* sense comptes */ }
        return { replacements, names: names.filter((n) => typeof n === 'string') }
    }
})

// 2.5 (`window.hellmc.config.get/set`, 06 §6 store `ui`): abans mock (tema/idioma es perdien a
// cada reinici, `src-node/preload.js`) — ara persisteix de veritat a `config.json`.
// F9: la primera vegada l'idioma és el del SO (ca/es si coincideix, si no anglès) i es desa.
function resolveLanguage() {
    const stored = ConfigManager.getUiConfig().language
    if (stored != null) return stored
    const locale = String(app.getLocale() || 'en').slice(0, 2).toLowerCase()
    const language = locale === 'ca' || locale === 'es' ? locale : 'en'
    ConfigManager.setUiConfig({ language })
    ConfigManager.save()
    return language
}

module.exports = {
    AZURE_CLIENT_ID,
    AppLog,
    AuthManager,
    BrowserWindow,
    CURRENT_TERMS_VERSION,
    ConfigManager,
    DataSharing,
    DistributionIndexProcessor,
    DistroAPI,
    ErrorReports,
    FullRepair,
    MSFT_ERROR,
    MSFT_OPCODE,
    MSFT_REPLY_TYPE,
    Menu,
    MojangIndexProcessor,
    ProcessBuilder,
    RENDERER_ORIGIN,
    ROOT,
    SIGNING_KEYS,
    Security,
    ServersDat,
    Telemetry,
    Type,
    app,
    assertId,
    autoUpdater,
    createEtaEstimator,
    devLog,
    dialog,
    discoverBestJvmInstallation,
    downloadFile,
    ensureJavaDirIsRoot,
    extractJdk,
    filterApplicableJavaPaths,
    fs,
    getValidatableJavaPaths,
    ipcMain,
    isDev,
    isJavaExecPath,
    javaExecFromRoot,
    latestOpenJDK,
    nativeTheme,
    openExternalSafely,
    os,
    parseAddress,
    path,
    pathToFileURL,
    pingJavaServer,
    rankApplicableJvms,
    reportError,
    resolveJvmSettings,
    resolveLanguage,
    rssParser,
    semver,
    shell,
    validateLocalFile,
    validateSelectedJvm
}
