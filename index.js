// Requirements
const { app, BrowserWindow, dialog, ipcMain, Menu, nativeTheme, shell } = require('electron')
const autoUpdater = require('electron-updater').autoUpdater
const fs = require('fs')
const isDev = require('./app/assets/js/isdev')
const os = require('os')
const path = require('path')
const semver = require('semver')
const { pathToFileURL } = require('url')
const { AZURE_CLIENT_ID, MSFT_OPCODE, MSFT_REPLY_TYPE, MSFT_ERROR } = require('./app/assets/js/ipcconstants')

const Security = require('./app/assets/js/security')
/** S4: ids de versió/servidor que vénen del renderer (mai camins ni text lliure). */
function assertId(id, { nullable = false } = {}) {
    if (nullable && id == null) return
    if (!Security.isValidId(id)) throw new Error('INVALID_ID')
}

// S4: només la finestra principal (renderer-dist o el servidor de Vite en dev) pot cridar els handlers IPC. Les finestres
// de Microsoft (contingut remot) no hi tenen accés encara que compartissin procés.
const RENDERER_ORIGIN = pathToFileURL(path.join(__dirname, 'renderer-dist')).toString().toLowerCase()
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
const AppLog = require('./app/assets/js/applog')
AppLog.install(path.join(app.getPath('userData'), 'logs'))

// Una sola instància: dues finestres compartirien (i trepitjarien) `config.json` i l'RPC de Discord.
if (!app.requestSingleInstanceLock()) {
    app.exit(0)
}
app.on('second-instance', () => {
    if (win != null && !win.isDestroyed()) {
        if (win.isMinimized()) win.restore()
        win.focus()
    }
})
// Errors no capturats: es registren (sense el diàleg natiu d'Electron) i l'app continua.
process.on('uncaughtException', (err) => {
    console.error('[main] uncaughtException', err)
})
process.on('unhandledRejection', (reason) => {
    console.error('[main] unhandledRejection', reason)
})

// Setup auto updater.
//
// 2.5 (Configuració > Actualitzacions): petició explícita de l'usuari, «com el de Discord» —
// mai cap assistent NSIS visible i l'actualització «es fa sola». Dues peces calien, no només
// codi: `electron-builder.yml` tenia `nsis.oneClick: false` (assistent multi-pas, es veu
// sempre, també en una actualització silenciosa — `isSilent` de `quitAndInstall` només
// suprimeix la UI de l'INSTAL·LADOR, no evita l'assistent si el paquet es va construir amb
// `oneClick:false`); canviat a `oneClick: true`. Amb això, `autoDownload` (ja `true` per
// defecte; a `darwin` es manté `false`: l'app no està signada i només s'avisa, vegeu més avall)
// + `autoInstallOnAppQuit` (per defecte `true`, només desactivat a `isDev`) ja basten: es
// baixa en segon pla sense preguntar i s'instal·la sola el proper cop que l'app es tanqui del
// tot, sense cap diàleg «Reinicia ara?».
//
// `configureAutoUpdater` es crida un cop en arrencar (`app.on('ready', …)` més avall) i reenvia
// els esdeveniments a la finestra principal (`win`) si existeix.
function broadcastUpdaterEvent(updaterEvent) {
    if (win != null && !win.isDestroyed()) {
        win.webContents.send('hellmc:updater-event', updaterEvent)
    }
}
function configureAutoUpdater(allowPrerelease) {
    if (allowPrerelease != null) {
        autoUpdater.allowPrerelease = allowPrerelease
    }

    if (isDev) {
        autoUpdater.autoInstallOnAppQuit = false
        autoUpdater.updateConfigPath = path.join(__dirname, 'dev-app-update.yml')
    }
    // macOS sense signatura (Developer ID): Squirrel.Mac no instal·laria res. Només s'avisa que hi ha una
    // versió nova (`update-available`) i la interfície porta a la pàgina de descàrrega; no es baixa res.
    if (process.platform === 'darwin') {
        autoUpdater.autoDownload = false
        autoUpdater.autoInstallOnAppQuit = false
    }
    autoUpdater.removeAllListeners()
    autoUpdater.on('checking-for-update', () => {
        broadcastUpdaterEvent({ type: 'checking-for-update' })
    })
    autoUpdater.on('update-available', (info) => {
        broadcastUpdaterEvent({ type: 'update-available', info })
    })
    autoUpdater.on('update-not-available', (info) => {
        broadcastUpdaterEvent({ type: 'update-not-available', info })
    })
    autoUpdater.on('download-progress', (progress) => {
        broadcastUpdaterEvent({ type: 'download-progress', info: { percent: progress.percent } })
    })
    autoUpdater.on('update-downloaded', (info) => {
        broadcastUpdaterEvent({ type: 'update-downloaded', info })
        // Deliberadament NO es demana res aquí: `autoInstallOnAppQuit` ja instal·la en silenci
        // (oneClick, cap assistent) el proper cop que l'app es tanqui del tot.
    })
    autoUpdater.on('error', (err) => {
        broadcastUpdaterEvent({ type: 'error', info: { message: err?.message ?? String(err) } })
    })
}

// 2.5 (`window.hellmc.updater`, 06 §5): `check` desencadena la mateixa comprovació silenciosa
// (els resultats arriben per `hellmc:updater-event`, mai com a valor resolt — `checkForUpdates`
// només confirma que la comprovació s'ha iniciat). `install` força la instal·lació ara mateix
// (`isSilent:true` — mai assistent, encara que `oneClick` ja ho garanteix igualment;
// `isForceRunAfter:true` reobre l'app, com Discord) — només té sentit cridar-ho després d'un
// `update-downloaded`; si no hi ha res baixat, `quitAndInstall` no fa res perillós (electron-updater
// ho ignora), no calia guardar estat propi per evitar-ho.
ipcMain.handle('hellmc:updater-check', async () => {
    try {
        await autoUpdater.checkForUpdates()
    } catch (err) {
        // Sense xarxa o sense configuració d'actualitzacions: es notifica com a esdeveniment, no com a error d'IPC.
        broadcastUpdaterEvent({ type: 'error', info: { message: err?.message ?? String(err) } })
    }
})
ipcMain.handle('hellmc:updater-install', () => {
    autoUpdater.quitAndInstall(true, true)
})
// 07 §6 «Actualitzacions» → canal (estable/prerelease): `allowPrerelease` es desa a `config.json`
// (`settings.launcher.allowPrerelease`, ja existent) i s'aplica a l'updater en arrencar i en canviar-lo.
ipcMain.handle('hellmc:updater-get-prerelease', () => ConfigManager.getAllowPrerelease())
ipcMain.handle('hellmc:updater-set-prerelease', (_event, allow) => {
    // Un build prerelease no ha de poder baixar a estable sense voler (mateixa regla que l'app antiga).
    const currentIsPrerelease = (semver.prerelease(app.getVersion()) ?? []).length > 0
    const effective = currentIsPrerelease ? true : !!allow
    ConfigManager.setAllowPrerelease(effective)
    ConfigManager.save()
    autoUpdater.allowPrerelease = effective
    return effective
})
// Language-aware reload
const ConfigManager = require('./app/assets/js/configmanager')
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
const AuthManager = require('./app/assets/js/authmanager')
const DistroManager = require('./app/assets/js/distromanager')
const { DistroAPI, SIGNING_KEYS } = DistroManager
const ProcessBuilder = require('./app/assets/js/processbuilder')
const DataSharing = require('./app/assets/js/datasharing')
const ServersDat = require('./app/assets/js/serversdat')
const { FullRepair, DistributionIndexProcessor, MojangIndexProcessor, downloadFile } = require('hellmc-core/dl')
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

// Disable hardware acceleration.
// https://electronjs.org/docs/tutorial/offscreen-rendering
// D14: només es desactiva si l'usuari ho ha triat (Configuració > Launcher) o si la GPU ha petat abans (vegeu `child-process-gone`).
if (ConfigManager.getUiConfig().hardwareAcceleration === false) {
    app.disableHardwareAcceleration()
}
app.on('child-process-gone', (_event, details) => {
    if (details.type === 'GPU' && ['crashed', 'abnormal-exit', 'launch-failed', 'integrity-failure'].includes(details.reason)) {
        console.error('[main] GPU process gone:', details.reason, '— hardware acceleration will be disabled on next start')
        ConfigManager.setUiConfig({ hardwareAcceleration: false })
        ConfigManager.save()
    }
})


const REDIRECT_URI = 'https://login.microsoftonline.com/common/oauth2/nativeclient'

// Microsoft Auth Login
let msftAuthWindow
let msftAuthSuccess
let msftAuthViewSuccess
let msftAuthViewOnClose
// S8: PKCE (RFC 7636) + `state` aleatori + sessió **efímera** (cap galeta de Microsoft persistent al launcher).
let pendingMsftLogin = null // { state, verifier }
function base64Url(buffer) {
    return buffer.toString('base64url')
}
ipcMain.on(MSFT_OPCODE.OPEN_LOGIN, (ipcEvent, ...arguments_) => {
    if (msftAuthWindow) {
        ipcEvent.reply(MSFT_OPCODE.REPLY_LOGIN, MSFT_REPLY_TYPE.ERROR, MSFT_ERROR.ALREADY_OPEN, msftAuthViewOnClose)
        return
    }
    msftAuthSuccess = false
    msftAuthViewSuccess = arguments_[0]
    msftAuthViewOnClose = arguments_[1]
    const crypto = require('crypto')
    const verifier = base64Url(crypto.randomBytes(32))
    pendingMsftLogin = { state: base64Url(crypto.randomBytes(16)), verifier }
    msftAuthWindow = new BrowserWindow({
        title: 'Microsoft',
        backgroundColor: '#222222',
        width: 520,
        height: 600,
        frame: true,
        icon: getPlatformIcon('SealCircle'),
        webPreferences: {
            // Partició sense `persist:` = sessió en memòria: es descarta en tancar la finestra.
            partition: `ms-login-${Date.now()}`,
            sandbox: true,
            contextIsolation: true,
            nodeIntegration: false
        }
    })

    msftAuthWindow.on('closed', () => {
        msftAuthWindow = undefined
    })

    msftAuthWindow.on('close', () => {
        if (!msftAuthSuccess) {
            ipcEvent.reply(MSFT_OPCODE.REPLY_LOGIN, MSFT_REPLY_TYPE.ERROR, MSFT_ERROR.NOT_FINISHED, msftAuthViewOnClose)
        }
    })

    msftAuthWindow.webContents.on('did-navigate', (_, uri) => {
        if (uri.startsWith(REDIRECT_URI)) {
            const url = new URL(uri)
            const code = url.searchParams.get('code')
            if (code && url.searchParams.get('state') !== pendingMsftLogin?.state) {
                // La resposta no correspon a aquest intent (CSRF/«login CSRF»): es descarta.
                console.warn('[main] Microsoft login: state mismatch, ignoring response')
                return
            }
            if (code) {
                const queryMap = Object.fromEntries(url.searchParams.entries())

                ipcEvent.reply(MSFT_OPCODE.REPLY_LOGIN, MSFT_REPLY_TYPE.SUCCESS, queryMap, msftAuthViewSuccess)

                msftAuthSuccess = true
                msftAuthWindow.close()
                msftAuthWindow = null
            }
        }
    })

    msftAuthWindow.removeMenu()
    msftAuthWindow.loadURL(`https://login.microsoftonline.com/consumers/oauth2/v2.0/authorize?prompt=select_account&client_id=${AZURE_CLIENT_ID}&response_type=code&scope=XboxLive.signin%20offline_access&redirect_uri=${REDIRECT_URI}&state=${pendingMsftLogin.state}&code_challenge=${base64Url(crypto.createHash('sha256').update(verifier).digest())}&code_challenge_method=S256`)
})

// Microsoft Auth Logout
let msftLogoutWindow
let msftLogoutSuccess
let msftLogoutSuccessSent
ipcMain.on(MSFT_OPCODE.OPEN_LOGOUT, (ipcEvent, uuid, isLastAccount) => {
    if (msftLogoutWindow) {
        ipcEvent.reply(MSFT_OPCODE.REPLY_LOGOUT, MSFT_REPLY_TYPE.ERROR, MSFT_ERROR.ALREADY_OPEN)
        return
    }

    msftLogoutSuccess = false
    msftLogoutSuccessSent = false
    msftLogoutWindow = new BrowserWindow({
        title: 'Microsoft',
        backgroundColor: '#222222',
        width: 520,
        height: 600,
        frame: true,
        icon: getPlatformIcon('SealCircle')
    })

    msftLogoutWindow.on('closed', () => {
        msftLogoutWindow = undefined
    })

    msftLogoutWindow.on('close', () => {
        if (!msftLogoutSuccess) {
            ipcEvent.reply(MSFT_OPCODE.REPLY_LOGOUT, MSFT_REPLY_TYPE.ERROR, MSFT_ERROR.NOT_FINISHED)
        } else if (!msftLogoutSuccessSent) {
            msftLogoutSuccessSent = true
            ipcEvent.reply(MSFT_OPCODE.REPLY_LOGOUT, MSFT_REPLY_TYPE.SUCCESS, uuid, isLastAccount)
        }
    })

    msftLogoutWindow.webContents.on('did-navigate', (_, uri) => {
        if (uri.startsWith('https://login.microsoftonline.com/common/oauth2/v2.0/logoutsession')) {
            msftLogoutSuccess = true
            setTimeout(() => {
                if (!msftLogoutSuccessSent) {
                    msftLogoutSuccessSent = true
                    ipcEvent.reply(MSFT_OPCODE.REPLY_LOGOUT, MSFT_REPLY_TYPE.SUCCESS, uuid, isLastAccount)
                }

                if (msftLogoutWindow) {
                    msftLogoutWindow.close()
                    msftLogoutWindow = null
                }
            }, 5000)
        }
    })

    msftLogoutWindow.removeMenu()
    msftLogoutWindow.loadURL('https://login.microsoftonline.com/common/oauth2/v2.0/logout')
})

// Keep a global reference of the window object, if you don't, the window will
// be closed automatically when the JavaScript object is garbage collected.
let win

function createMenu() {

    if (process.platform === 'darwin') {

        // Extend default included application menu to continue support for quit keyboard shortcut
        let applicationSubMenu = {
            label: 'Application',
            submenu: [{
                label: 'About Application',
                selector: 'orderFrontStandardAboutPanel:'
            }, {
                type: 'separator'
            }, {
                label: 'Quit',
                accelerator: 'Command+Q',
                click: () => {
                    app.quit()
                }
            }]
        }

        // New edit menu adds support for text-editing keyboard shortcuts
        let editSubMenu = {
            label: 'Edit',
            submenu: [{
                label: 'Undo',
                accelerator: 'CmdOrCtrl+Z',
                selector: 'undo:'
            }, {
                label: 'Redo',
                accelerator: 'Shift+CmdOrCtrl+Z',
                selector: 'redo:'
            }, {
                type: 'separator'
            }, {
                label: 'Cut',
                accelerator: 'CmdOrCtrl+X',
                selector: 'cut:'
            }, {
                label: 'Copy',
                accelerator: 'CmdOrCtrl+C',
                selector: 'copy:'
            }, {
                label: 'Paste',
                accelerator: 'CmdOrCtrl+V',
                selector: 'paste:'
            }, {
                label: 'Select All',
                accelerator: 'CmdOrCtrl+A',
                selector: 'selectAll:'
            }]
        }

        // Bundle submenus into a single template and build a menu object with it
        let menuTemplate = [applicationSubMenu, editSubMenu]
        let menuObject = Menu.buildFromTemplate(menuTemplate)

        // Assign it to the application
        Menu.setApplicationMenu(menuObject)

    }

}

// Finestra principal (renderer Vite+Preact). Amb `RENDERER_DEV_SERVER=1` carrega el servidor de
// `vite` (`npm run dev`) en lloc del build estàtic de `renderer-dist/`.
function createWindow() {
    if (win != null) {
        win.focus()
        return
    }

    // 08 §8: botons de finestra natius via `titleBarOverlay` (Windows/Linux) o `trafficLightPosition`
    // (macOS) en comptes de simular-los amb CSS (l'error de la barra estirada a macOS de l'app
    // antiga venia exactament d'intentar-ho amb CSS, 08 §8.1).
    const platformTitleBarOptions = process.platform === 'darwin'
        ? { titleBarStyle: 'hidden', trafficLightPosition: { x: 16, y: 14 } }
        : { titleBarStyle: 'hidden', titleBarOverlay: { color: '#15181D', symbolColor: '#ECEFF4', height: 36 } }

    win = new BrowserWindow({
        width: 1280,
        height: 760,
        minWidth: 800,
        minHeight: 560,
        title: 'HellMC Client',
        icon: getPlatformIcon('SealCircle'),
        ...platformTitleBarOptions,
        webPreferences: {
            preload: path.join(__dirname, 'src-node', 'preload.js'),
            nodeIntegration: false,
            contextIsolation: true,
            sandbox: true
        },
        backgroundColor: '#0E1013'
    })

    if (process.env.RENDERER_DEV_SERVER === '1') {
        const devUrl = 'http://localhost:5173'
        const loadDevServer = () => {
            win?.loadURL(devUrl).catch(() => { /* handled by did-fail-load below */ })
        }
        // El servidor de `vite` pot no estar a punt encara (dues comandes arrencant en paral·lel,
        // `npm run dev`); si falla la primera càrrega, es reintenta en lloc de quedar-se en blanc.
        win.webContents.on('did-fail-load', () => {
            if (win != null) {
                setTimeout(loadDevServer, 500)
            }
        })
        loadDevServer()
    } else {
        win.loadURL(pathToFileURL(path.join(__dirname, 'renderer-dist', 'index.html')).toString())
    }

    // O2: errors i avisos del renderer, i fallades del preload, també van al log persistent.
    win.webContents.on('console-message', (event, ...legacy) => {
        const level = event?.level ?? legacy[0]
        const message = event?.message ?? legacy[1]
        if (level === 'warning' || level === 'error' || level === 2 || level === 3) console.warn(`[renderer:${level}]`, message)
    })
    win.webContents.on('preload-error', (_event, preloadPath, error) => {
        console.error('[main] preload error', preloadPath, error)
    })

    if (isDev) {
        win.webContents.openDevTools()
    }
    win.removeMenu()

    // 2.4 (notícies completes): primer cop que HTML extern de veritat (article RSS sanititzat) es
    // renderitza dins la finestra — un clic a un enllaç del contingut (o Ctrl+clic/mig-clic obrint
    // finestra nova) no ha de navegar-hi mai dins d'aquesta finestra ni obrir-ne una altra
    // d'Electron sense CSP/preload. El lector ja intercepta els clics i crida `system.openExternal`
    // (renderer), això és només la xarxa de seguretat perquè cap altre camí (arrossegar un enllaç,
    // un `<a>` sense el listener per algun motiu) mai deixi la finestra fora de `renderer-dist`/
    // `localhost:5173`.
    win.webContents.on('will-navigate', (event, url) => {
        const isDevServer = process.env.RENDERER_DEV_SERVER === '1' && url.startsWith('http://localhost:5173')
        const isOwnFile = url.startsWith(pathToFileURL(path.join(__dirname, 'renderer-dist')).toString())
        if (isDevServer || isOwnFile) return
        event.preventDefault()
        openExternalSafely(url)
    })
    win.webContents.setWindowOpenHandler(({ url }) => {
        openExternalSafely(url)
        return { action: 'deny' }
    })

    win.on('maximize', () => {
        win.webContents.send('hellmc:window-maximize-changed', true)
    })
    win.on('unmaximize', () => {
        win.webContents.send('hellmc:window-maximize-changed', false)
    })

    win.on('closed', () => {
        win = null
    })
}

// IPC de `src-node/preload.js` (`window.hellmc`), només fet servir per la finestra de proves. Es
// resol la finestra a partir del `sender` (no de `win`) perquè, si en el futur hi ha
// més d'una finestra amb aquest preload, cadascuna controli la seva pròpia.
ipcMain.on('hellmc:window-minimize', (event) => {
    BrowserWindow.fromWebContents(event.sender)?.minimize()
})
ipcMain.on('hellmc:window-maximize-toggle', (event) => {
    const senderWin = BrowserWindow.fromWebContents(event.sender)
    if (senderWin == null) return
    if (senderWin.isMaximized()) {
        senderWin.unmaximize()
    } else {
        senderWin.maximize()
    }
})
ipcMain.on('hellmc:window-close', (event) => {
    BrowserWindow.fromWebContents(event.sender)?.close()
})
// 08 §8.2: recolora els botons natius (`titleBarOverlay`) en canviar de tema. Només Windows/Linux
// ('darwin' fa servir semàfors natius, sense overlay — `setTitleBarOverlay` no hi aplica).
const TITLEBAR_OVERLAY_COLORS = {
    dark: { color: '#15181D', symbolColor: '#ECEFF4' },
    light: { color: '#FFFFFF', symbolColor: '#14171C' }
}
ipcMain.on('hellmc:set-titlebar-overlay', (event, effectiveTheme) => {
    if (process.platform === 'darwin') return
    const senderWin = BrowserWindow.fromWebContents(event.sender)
    const colors = TITLEBAR_OVERLAY_COLORS[effectiveTheme]
    if (senderWin == null || colors == null) return
    senderWin.setTitleBarOverlay({ ...colors, height: 36 })
})
// 08 §11: `nativeTheme.themeSource` perquè els diàlegs/menús natius segueixin el tema de l'app
// (`system` = segueix el SO). L'`titleBarOverlay` ja es recolora a part (més amunt).
ipcMain.on('hellmc:set-native-theme', (_event, theme) => {
    if (theme === 'system' || theme === 'dark' || theme === 'light') nativeTheme.themeSource = theme
})
ipcMain.handle('hellmc:system-memory', () => {
    return { totalMb: Math.round(os.totalmem() / 1048576), freeMb: Math.round(os.freemem() / 1048576) }
})
// S3: només http(s) (mai `file:`/manejadors de protocol) i només carpetes dins de les dades del launcher.
function openExternalSafely(rawUrl) {
    const url = Security.safeExternalUrl(rawUrl)
    if (url == null) {
        console.warn('[main] blocked external URL', String(rawUrl).slice(0, 200))
        return Promise.resolve()
    }
    return shell.openExternal(url)
}
ipcMain.handle('hellmc:open-path', (_event, p) => {
    if (typeof p !== 'string' || !(Security.isInside(ConfigManager.getDataDirectory(), p) || Security.isInside(app.getPath('userData'), p))) {
        console.warn('[main] blocked open-path', String(p).slice(0, 200))
        return ''
    }
    return shell.openPath(p)
})
ipcMain.handle('hellmc:open-external', (_event, url) => openExternalSafely(url))
// 2.5 (Sobre > «Llicències de tercers», D23): `THIRD_PARTY_LICENSES.txt` viu a l'arrel del repo en
// dev i a `extraResources` (`electron-builder.yml`) en un paquet real — mai dins l'asar.
// `LICENSE-LGPL-3.0.txt`: text de la llicència de `HellMC-Core` (02 §3/§7.2).
function openBundledFile(name) {
    const file = isDev ? path.join(__dirname, name) : path.join(process.resourcesPath, name)
    return shell.openPath(file)
}
ipcMain.handle('hellmc:open-third-party-licenses', () => openBundledFile('THIRD_PARTY_LICENSES.txt'))
ipcMain.handle('hellmc:open-lgpl-license', () => openBundledFile('LICENSE-LGPL-3.0.txt'))
// O2: carpeta de logs i informe de diagnòstic (sense credencials: `AppLog.tailFile` redacta) per demanar suport.
// D15/D8: termes, política de privacitat i consentiment de telemetria (separat). `CURRENT_TERMS_VERSION` puja quan canvien
// els textos: tothom torna a veure la pantalla (sense login si ja hi ha sessió).
const CURRENT_TERMS_VERSION = 1
// Telemetria opt-in (docs/web-i-telemetria): l'identificador anònim mai surt del procés principal.
const Telemetry = require('./app/assets/js/telemetry').create({
    getLegal: () => ConfigManager.getLegal(),
    setLegal: (patch) => ConfigManager.setLegal(patch),
    save: () => ConfigManager.save(),
    termsVersion: () => CURRENT_TERMS_VERSION,
    appVersion: app.getVersion(),
    platform: process.platform,
    isDev
})
ipcMain.handle('hellmc:legal-get', () => {
    // eslint-disable-next-line no-unused-vars
    const { telemetryId, telemetryForget, ...visible } = ConfigManager.getLegal()
    return { currentVersion: CURRENT_TERMS_VERSION, ...visible }
})
ipcMain.handle('hellmc:legal-accept', async (_event, telemetryOptIn) => {
    ConfigManager.setLegal({ termsAcceptedVersion: CURRENT_TERMS_VERSION, acceptedAt: new Date().toISOString(), telemetryOptIn: telemetryOptIn === true })
    ConfigManager.save()
    await Telemetry.onConsentChanged()
})
ipcMain.handle('hellmc:legal-set-telemetry', async (_event, value) => {
    if (typeof value !== 'boolean') throw new Error('INVALID_VALUE')
    ConfigManager.setLegal({ telemetryOptIn: value })
    ConfigManager.save()
    await Telemetry.onConsentChanged()
})

// D16: «Tanca la sessió i esborra les dades»: comptes i tokens, acceptació legal, cache i logs. No toca les dades del joc
// (mons, versions instal·lades): són grans i del jugador. Reinicia el launcher.
ipcMain.handle('hellmc:wipe-local-data', async () => {
    if (runningInstances.size > 0) throw new Error('GAME_RUNNING')
    ConfigManager.removeAllAccounts()
    await Telemetry.disable() // demana al servidor que esborri el rastre i descarta l'identificador local
    ConfigManager.setLegal({ termsAcceptedVersion: null, acceptedAt: null, telemetryOptIn: false })
    ConfigManager.save()
    const userData = app.getPath('userData')
    for (const name of ['distribution.json', 'distribution.json.sig', 'newscache.json', 'config.json.bak', 'config.json.bak-v1']) {
        await fs.promises.rm(path.join(userData, name), { force: true }).catch(() => { /* ja no hi és */ })
    }
    const logsDir = path.join(userData, 'logs')
    for (const name of await fs.promises.readdir(logsDir).catch(() => [])) {
        const file = path.join(logsDir, name)
        // El log actual està obert per escriure: es buida; els rotats s'esborren.
        if (name === 'launcher.log') await fs.promises.writeFile(file, '').catch(() => { /* ignora */ })
        else await fs.promises.rm(file, { force: true }).catch(() => { /* ignora */ })
    }
    app.relaunch()
    app.exit(0)
})
ipcMain.handle('hellmc:open-logs', () => shell.openPath(path.join(app.getPath('userData'), 'logs')))
ipcMain.handle('hellmc:diagnostic-report', () => {
    const selected = ConfigManager.getSelectedVersion()
    const lines = [
        `HellMC Client ${app.getVersion()}${app.isPackaged ? '' : ' (dev)'}`,
        `OS: ${process.platform} ${process.arch} ${os.release()}`,
        `Electron ${process.versions.electron} · Chrome ${process.versions.chrome} · Node ${process.versions.node}`,
        `RAM: ${Math.round(os.freemem() / 1048576)} MB free of ${Math.round(os.totalmem() / 1048576)} MB`,
        `Selected version: ${selected ?? '—'}`,
        `Running instances: ${runningInstances.size}`,
        '',
        '--- launcher.log (last 80 lines) ---',
        ...AppLog.tailFile(AppLog.getLogFile(), 80, 64 * 1024)
    ]
    return lines.join('\n')
})
// `process.env.npm_package_version` (l'antic valor del mock a `preload.js`) només existeix quan
// el procés principal s'ha arrencat via `npm run …` — en un paquet real (producció) mai hi és,
// Sobre mostraria sempre «0.0.0-dev». Síncron (`event.returnValue`) perquè `api.ts` declara
// `system.appVersion` com a valor pla, no una promesa — es demana un sol cop en carregar el
// preload, igual que `process.platform`.
ipcMain.on('hellmc:system-app-version', (event) => {
    event.returnValue = app.getVersion()
})
// 07 §2.4: la distribució exigeix una versió mínima de client (`minClientVersion`) → pantalla de
// bloqueig «Actualitza el client». Només en un paquet real: en desenvolupament (`app.isPackaged` fals)
// la versió del `package.json` no és una versió publicada i bloquejaria el desenvolupador.
ipcMain.handle('hellmc:system-client-outdated', (_event, minClientVersion) => {
    if (!app.isPackaged || typeof minClientVersion !== 'string' || semver.valid(minClientVersion) == null) return false
    // Les versions preliminars (2.0.0-beta.N) compten com la seva versió base: si no, `semver.lt('2.0.0-beta.1', '2.0.0')`
    // és cert i el canal beta quedaria sempre bloquejat.
    const current = semver.coerce(app.getVersion())
    return current != null && semver.lt(current, minClientVersion)
})

// 07 §1.1 «Estat de Mojang»: l'API pública antiga (`status.mojang.com`) està tancada i no n'hi ha cap
// substitut oficial; es mesura l'**accessibilitat** dels serveis que el joc fa servir de veritat
// (autenticació/sessions/perfil). Qualsevol resposta HTTP compta com a «accessible»; només la manca
// de resposta (xarxa caiguda, DNS, timeout) com a caiguda.
const MINECRAFT_SERVICES = [
    { id: 'session', url: 'https://sessionserver.mojang.com/' },
    { id: 'services', url: 'https://api.minecraftservices.com/' },
    { id: 'auth', url: 'https://login.microsoftonline.com/' } // `authserver.mojang.com` (Yggdrasil) ja està tancat
]
ipcMain.handle('hellmc:status-minecraft', async () => {
    const services = await Promise.all(MINECRAFT_SERVICES.map(async (svc) => {
        try {
            await fetch(svc.url, { method: 'HEAD', signal: AbortSignal.timeout(5000) })
            return { id: svc.id, ok: true }
        } catch {
            return { id: svc.id, ok: false }
        }
    }))
    return { services }
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
ipcMain.handle('hellmc:config-get', () => ({ ui: { ...ConfigManager.getUiConfig(), language: resolveLanguage() } }))
ipcMain.handle('hellmc:config-set', (_event, patch) => {
    // S4: només claus conegudes de la UI i amb el tipus correcte.
    const ui = Security.sanitizeUiPatch(patch?.ui)
    if (Object.keys(ui).length > 0) ConfigManager.setUiConfig(ui)
    ConfigManager.save()
    if ('discordPresence' in ui) syncMenuRpc()
})

// 2.5 (Configuració > Joc, resta de 07 §6): resolució/pantalla completa/autoconnect/launch
// detached/carpeta de dades. Cap camp nou a `configmanager.js` — tots ja existien (l'app antiga
// els té, només sense cap UI nova que hi arribés) i `ProcessBuilder` ja els llegeix directament
// de `ConfigManager` internament (`processbuilder.js:95/424/558/618/621/715/720/722`, mai rebuts
// per paràmetre) — persistir-los aquí ja n'hi ha prou perquè el proper «Jugar» els faci servir,
// sense tocar `hellmc:launch-start` gens.
ipcMain.handle('hellmc:game-settings-get', () => ({
    resWidth: ConfigManager.getGameWidth(),
    resHeight: ConfigManager.getGameHeight(),
    fullscreen: ConfigManager.getFullscreen(),
    autoConnect: ConfigManager.getAutoConnect(),
    launchDetached: ConfigManager.getLaunchDetached(),
    dataDirectory: ConfigManager.getDataDirectory(),
    pendingDataDirectory: ConfigManager.getPendingDataDirectory()
}))
ipcMain.handle('hellmc:game-settings-set', (_event, patch) => {
    if (patch.resWidth != null && ConfigManager.validateGameWidth(patch.resWidth)) ConfigManager.setGameWidth(patch.resWidth)
    if (patch.resHeight != null && ConfigManager.validateGameHeight(patch.resHeight)) ConfigManager.setGameHeight(patch.resHeight)
    if (patch.fullscreen != null) ConfigManager.setFullscreen(patch.fullscreen)
    if (patch.autoConnect != null) ConfigManager.setAutoConnect(patch.autoConnect)
    if (patch.launchDetached != null) ConfigManager.setLaunchDetached(patch.launchDetached)
    ConfigManager.save()
})
// `commonDir`/`instanceDir` (`DistroAPI`) i `dataPath` (`ConfigManager.getLauncherDirectory`'s
// sibling) es resolen un sol cop en arrencar l'app (dalt, `DistroAPI['commonDir'] = …`) — canviar
// la carpeta en calent no mouria cap dada ni refrescaria res que ja s'hagi llegit, per això
// només es desa la preferència i cal reiniciar (avisat a la UI, `GameSection.tsx`), mateix
// patró que qualsevol altre launcher que permet moure la carpeta de dades.
ipcMain.handle('hellmc:game-data-directory-pick', async (event) => {
    const senderWin = BrowserWindow.fromWebContents(event.sender)
    const result = await dialog.showOpenDialog(senderWin, { properties: ['openDirectory', 'createDirectory'] })
    if (result.canceled || result.filePaths.length === 0) return null
    const picked = result.filePaths[0]
    try {
        fs.accessSync(picked, fs.constants.W_OK)
    } catch {
        throw new Error('DIRECTORY_NOT_WRITABLE')
    }
    // No s'aplica en calent: queda «pendent» fins que es reinicia (`ConfigManager.load`).
    ConfigManager.setPendingDataDirectory(picked === ConfigManager.getDataDirectory() ? null : picked)
    ConfigManager.save()
    return picked
})
ipcMain.handle('hellmc:app-relaunch', () => {
    app.relaunch()
    app.exit(0)
})

// ── Discord RPC «en partida» (P17, 06 §8.1): mod HellMC-Presence ────────────────────────────────
// El mod (jar universal Fabric/Forge/NeoForge, repo `HellMC-Presence`) viu dins el procés del joc i
// llegeix `hellmc-presence.json` de la carpeta d'instància — aquí s'escriu abans de cada llançament
// amb el que ve del `distribution.json` (`discord` global + `server.discord`) i els textos traduïts.
const PRESENCE_MOD_RE = /hellmc[_-]presence/i
const PRESENCE_TEXTS = {
    en: { menu: 'In the main menu', singleplayer: 'Playing singleplayer', joining: 'Loading…', joined: 'Playing on {server}', playingAt: 'Playing on {ip}', localServer: 'Local server', titleSingleplayer: 'Singleplayer', titleMultiplayer: 'Multiplayer (3rd-party Server)' },
    es: { menu: 'En el menú principal', singleplayer: 'Jugando en solitario', joining: 'Cargando…', joined: 'Jugando en {server}', playingAt: 'Jugando en {ip}', localServer: 'Servidor local', titleSingleplayer: 'Un jugador', titleMultiplayer: 'Multijugador (servidor de terceros)' },
    ca: { menu: 'Al menú principal', singleplayer: 'Jugant en solitari', joining: 'Carregant…', joined: 'Jugant a {server}', playingAt: 'Jugant a {ip}', localServer: 'Servidor local', titleSingleplayer: 'Un jugador', titleMultiplayer: 'Multijugador (servidor de tercers)' }
}
function writePresenceConfig(gameDir, rawDistribution, rawServer, version) {
    const gen = rawDistribution.discord
    const file = path.join(gameDir, 'hellmc-presence.json')
    // Sense Discord configurat el fitxer s'escriu igualment (sense `clientId`): el mod no fa Rich Presence, però sí el
    // títol i la icona de la finestra. Sense fitxer, el mod no fa res.
    const language = ConfigManager.getUiConfig()?.language ?? resolveLanguage()
    const serv = rawServer?.discord
    const config = {
        // D9: sense «Mostrar activitat a Discord» el mod no fa Rich Presence (però sí el títol i la icona de la finestra).
        clientId: ConfigManager.getUiConfig().discordPresence === false ? null : (gen?.clientId ?? null),
        versionName: version.name,
        // Títol de la finestra del joc: «HellMC Client <versió de Minecraft> - Singleplayer…».
        windowTitle: 'HellMC Client',
        minecraftVersion: version.minecraftVersion,
        serverName: rawServer?.name ?? null,
        serverShortId: serv?.shortId ?? null,
        // Mateixa assignació que feia el launcher antic (`discordwrapper.js`).
        largeImageKey: gen?.smallImageKey ?? null,
        largeImageText: gen?.smallImageText ?? null,
        smallImageKey: serv?.largeImageKey ?? null,
        smallImageText: serv?.largeImageText ?? null,
        startTimestamp: Date.now(),
        texts: PRESENCE_TEXTS[language] ?? PRESENCE_TEXTS.en
    }
    fs.writeFileSync(file, JSON.stringify(config, null, 2))
}

// ── Discord RPC «al menú» (P17, 06 §8.1) ──────────────────────────────────────────────────────
// Activa mentre el launcher és obert i no hi ha cap partida; en llançar el joc el launcher la
// tanca i el mòdul in-game (HellMC-Presence) en pren el relleu; en tancar l'última partida torna.
const DiscordWrapper = require('./app/assets/js/discordwrapper')
let menuRpcSettings = null
function syncMenuRpc() {
    if (menuRpcSettings == null) return
    if (runningInstances.size === 0 && ConfigManager.getUiConfig().discordPresence !== false) {
        DiscordWrapper.initRPC(menuRpcSettings, null)
    } else {
        DiscordWrapper.shutdownRPC()
    }
}
app.on('will-quit', () => DiscordWrapper.shutdownRPC())

// ── 2.1: distribució (real, `DistroAPI`) ─────────────────────────────────────────────────────
ipcMain.handle('hellmc:distro-get', async () => {
    const distro = await DistroAPI.getDistribution()
    if (menuRpcSettings == null && distro.rawDistribution.discord?.clientId != null) {
        menuRpcSettings = distro.rawDistribution.discord
        syncMenuRpc()
    }
    return distro.rawDistribution
})
ipcMain.handle('hellmc:distro-refresh', async () => {
    // `refreshDistributionOrFallback` no llança mai (cau a la que ja hi ha en memòria si la xarxa
    // falla) — no tenim manera senzilla de saber des d'aquí si ha vingut de xarxa o de fallback
    // sense entrar a l'intern d'`hellmc-core`, així que `fromCache` és una simplificació coneguda.
    const distro = await DistroAPI.refreshDistributionOrFallback()
    return { distribution: distro.rawDistribution, fromCache: false }
})

// ── 2.1: selecció recordada (real, mateixos getters/setters que `configmanager.js`) ──────────
ipcMain.handle('hellmc:selection-get', () => ({
    serverId: ConfigManager.getSelectedServer(),
    versionId: ConfigManager.getSelectedVersion()
}))
ipcMain.handle('hellmc:selection-set-version', (_event, versionId) => {
    assertId(versionId, { nullable: true })
    ConfigManager.setSelectedVersion(versionId)
    ConfigManager.save()
})
ipcMain.handle('hellmc:selection-set-server', (_event, serverId) => {
    assertId(serverId, { nullable: true })
    ConfigManager.setSelectedServer(serverId)
    ConfigManager.save()
})
ipcMain.handle('hellmc:selection-get-last-version-for-server', (_event, serverId) => {
    assertId(serverId)
    return ConfigManager.getLastVersionByServer(serverId)
})
ipcMain.handle('hellmc:selection-set-last-version-for-server', (_event, serverId, versionId) => {
    assertId(serverId)
    assertId(versionId)
    ConfigManager.setLastVersionByServer(serverId, versionId)
    ConfigManager.save()
})

// ── 2.1: comptes (real; només el camí "offline" — Microsoft OAuth és fora d'abast d'aquesta
// sessió, veure `11-progres-fase2.md` §6 — `auth.addMicrosoft` es queda com a mock que rebutja) ──
function normalizeAccount(raw) {
    if (raw == null) return null
    // `configmanager.js` desa el compte sense contrasenya com a `type: 'mojang'` (nom històric
    // d'Helios) — `renderer/src/api.ts` només coneix `'microsoft' | 'offline'`.
    return {
        type: raw.type === 'microsoft' ? 'microsoft' : 'offline',
        uuid: raw.uuid,
        displayName: raw.displayName
    }
}
ipcMain.handle('hellmc:auth-accounts', () => {
    const all = Object.values(ConfigManager.getAuthAccounts()).map(normalizeAccount)
    const selected = ConfigManager.getSelectedAccount()
    return { accounts: all, selectedUuid: selected != null ? selected.uuid : null }
})
ipcMain.handle('hellmc:auth-select', (_event, uuid) => {
    ConfigManager.setSelectedAccount(uuid)
    ConfigManager.save()
})
ipcMain.handle('hellmc:auth-add-offline', async (_event, username) => {
    if (!Security.isValidOfflineName(username)) throw new Error('INVALID_USERNAME')
    const account = await AuthManager.addMojangAccount(username)
    return normalizeAccount(account)
})
// 2.5 (Compte > Microsoft, últim tros pendent des de 2.1 §6): el preload nou obre la mateixa
// finestra d'OAuth que l'app antiga (`MSFT_OPCODE.OPEN_LOGIN`/`REPLY_LOGIN`, dalt — mai tocada,
// cap canal nou al main) i, un cop té el `code`, només calia aquest handler per acabar
// l'intercanvi — `AuthManager.addMicrosoftAccount` és exactament la mateixa funció que crida
// la UI.
ipcMain.handle('hellmc:auth-add-microsoft', async (_event, code) => {
    try {
        const verifier = pendingMsftLogin?.verifier
        pendingMsftLogin = null
        const account = await AuthManager.addMicrosoftAccount(code, verifier)
        return normalizeAccount(account)
    } catch (err) {
        // `AuthManager` rebutja amb `{code, network}` (no un `Error`): per IPC arribaria com
        // «[object Object]». Es converteix en `MS_ERROR:<CODI>`, que la UI tradueix (07 §8.3).
        if (err != null && typeof err === 'object' && !(err instanceof Error) && err.code != null) {
            throw new Error(`MS_ERROR:${err.code}`)
        }
        throw err
    }
})
ipcMain.handle('hellmc:auth-remove', async (_event, uuid) => {
    const current = ConfigManager.getAuthAccounts()[uuid]
    if (current == null) return
    if (current.type === 'microsoft') {
        await AuthManager.removeMicrosoftAccount(uuid)
    } else {
        await AuthManager.removeMojangAccount(uuid)
    }
})
ipcMain.handle('hellmc:auth-validate', async () => {
    if (ConfigManager.getSelectedAccount() == null) return { status: 'invalid' }
    try {
        // 'offline' (sense xarxa) mai és 'invalid': el compte no s'ha d'esborrar (07 §7.3).
        return { status: await AuthManager.validateSelectedStatus() }
    } catch {
        return { status: 'invalid' }
    }
})

// ── 2.1/2.11: llançament real (repair/descàrrega/procés), multi-instància de veritat ──────────
// Seqüència de llançament (`game.createRepair` +
// `verifyFiles`/`downloadFiles` + `prepareAndLaunch`), mai reimplementada — només reportada com a
// `LaunchProgress` (06 §5) en comptes de callbacks separats per fase. **Fora d'abast d'aquesta
// sessió**: detecció/instal·lació automàtica de Java (`asyncSystemScan`/`JavaGuard` a l'app
// antiga) — si no hi ha executable configurat, es reporta com a error en comptes d'intentar
// resoldre'l; Discord RPC i el parsing de log per regex (`GAME_JOINED_REGEX` etc.) tampoc es
// repliquen aquí, són polish de la Fase 2.1 posterior, no calen per tenir un «Jugar» real.
//
// Petició de l'usuari (2026-09-29): permetre jugar diverses versions alhora de debò (no un simple
// bloqueig global) + un lloc visible per veure quines instàncies hi ha obertes i forçar-ne el
// tancament — el motiu real: el botó Jugar torna a l'estat inicial en rebre `phase:'ready'` (el
// `spawn` ja ha tornat), però la finestra de Minecraft pot trigar uns segons més a aparèixer de
// veritat; sense cap indicador visible, l'usuari pensava que no havia fet res i tornava a prémer
// Jugar, obrint una segona instància de la mateixa versió sense voler.
//
// Disseny: `runningInstances` (clau = `versionId::serverId`, un procés spawnejat per clau) +
// `launchingTargets` (mateixa clau, mentre encara s'està verificant/descarregant, abans d'arribar a
// `spawn`) — **totes dues es comproven** abans d'acceptar un `launch-start` nou per a la mateixa
// clau, així es bloqueja el doble clic tant si el segon intent arriba durant la baixada com un cop
// ja engegat. Versions/servidors *diferents* no es bloquegen entre si (multi-instància real,
// decidit amb l'usuari).
const runningInstances = new Map() // key -> { id, versionId, serverId, startedAt, proc }
const launchingTargets = new Map() // key -> { repair: FullRepair | null }

function targetKey(versionId, serverId) {
    return `${versionId}::${serverId ?? ''}`
}

// B5: exclusió d'operacions de disc sobre les versions.
//  · `versionOps`: versions amb una instal·lació/verificació/desinstal·lació en curs (impedeixen jugar-hi).
//  · `repairChain`: les reparacions (`FullRepair`) comparteixen `common/` (biblioteques, assets): s'executen d'una en una,
//    ja sigui des de «Jugar» o des d'«Instal·lar»/«Actualitzar-ho tot».
const versionOps = new Map() // versionId -> 'install' | 'verify' | 'uninstall'
let repairChain = Promise.resolve()
function acquireRepairLock() {
    let release
    const previous = repairChain
    repairChain = new Promise((resolve) => { release = resolve })
    return previous.then(() => release)
}
function isVersionRunning(versionId) {
    for (const instance of runningInstances.values()) {
        if (instance.versionId === versionId) return true
    }
    for (const key of launchingTargets.keys()) {
        if (key.startsWith(`${versionId}::`)) return true
    }
    return false
}
/** Marca una operació sobre `versionId`; llança `VERSION_BUSY`/`VERSION_RUNNING` si no és possible. Retorna l'alliberament. */
function beginVersionOp(versionId, kind) {
    if (versionOps.has(versionId)) throw new Error('VERSION_BUSY')
    if (isVersionRunning(versionId)) throw new Error('VERSION_RUNNING')
    versionOps.set(versionId, kind)
    return () => versionOps.delete(versionId)
}
function instancesSnapshot() {
    return [...runningInstances.values()].map(({ id, versionId, serverId, startedAt }) => ({ id, versionId, serverId, startedAt }))
}
function broadcastInstances() {
    if (win != null && !win.isDestroyed()) {
        win.webContents.send('hellmc:instances-changed', instancesSnapshot())
    }
}

ipcMain.handle('hellmc:launch-start', async (event, target) => {
    assertId(target?.versionId)
    assertId(target?.serverId, { nullable: true })
    const sender = event.sender
    // F1: cada progrés porta el seu destí perquè la UI pugui seguir diversos llançaments alhora.
    const progressTarget = { versionId: target.versionId, serverId: target.serverId ?? null }
    const send = (progress) => { if (!sender.isDestroyed()) sender.send('hellmc:launch-progress', { ...progress, target: progressTarget }) }
    const key = targetKey(target.versionId, target.serverId)

    if (runningInstances.has(key) || launchingTargets.has(key)) {
        send({ phase: 'error', percent: 0, error: { code: 'ALREADY_RUNNING', message: 'This version is already running or launching.' } })
        return
    }
    // B5: no es pot llançar mentre la mateixa versió s'instal·la/verifica/desinstal·la.
    if (versionOps.has(target.versionId)) {
        send({ phase: 'error', percent: 0, error: { code: 'VERSION_BUSY', message: 'This version is being installed, verified or removed.' } })
        return
    }

    const account = ConfigManager.getSelectedAccount()
    if (account == null) {
        send({ phase: 'error', percent: 0, error: { code: 'NO_ACCOUNT', message: 'No account selected.' } })
        return
    }

    // Cancel·lació: `hellmc:launch-cancel` marca `cancelled`, mata el procés de reparació i rebutja `cancelledPromise`;
    // cada pas llarg es competeix amb ella (`step`) perquè el flux pari a l'instant en comptes de continuar
    // verificant/baixant i acabar obrint el joc igualment.
    const launchState = { repair: null, cancelled: false, cancel: () => {} }
    const cancelledPromise = new Promise((_, reject) => { launchState.cancel = () => reject(new Error('LAUNCH_CANCELLED')) })
    cancelledPromise.catch(() => { /* només serveix per al race de `step` */ })
    const step = (promise) => Promise.race([promise, cancelledPromise])
    const throwIfCancelled = () => { if (launchState.cancelled) throw new Error('LAUNCH_CANCELLED') }
    launchingTargets.set(key, launchState)
    let releaseRepairLock = null
    try {
        send({ phase: 'refreshing-distribution', percent: 0 })
        const distro = await step(DistroAPI.refreshDistributionOrFallback())
        const selectedVersion = distro.getVersionById(target.versionId)
        if (selectedVersion == null) {
            send({ phase: 'error', percent: 0, error: { code: 'VERSION_NOT_FOUND', message: `Version ${target.versionId} not found in distribution.` } })
            return
        }

        // Servidor recordat només si encara ofereix aquesta versió (D4/D18) — cerca sobre l'objecte
        // pla (`rawDistribution.servers`), no sobre cap mètode `getServerById` (no existeix a
        // `HeliosDistribution` de veritat, veure nota a `11-progres-fase2.md` §6).
        const rawServer = target.serverId != null
            ? distro.rawDistribution.servers?.find((s) => s.id === target.serverId)
            : null
        const server = rawServer != null && rawServer.versions.some((v) => v.id === selectedVersion.rawVersion.id)
            ? rawServer
            : null

        devLog(`launch-start target=${JSON.stringify(target)} server=${server?.id ?? null}`)

        send({ phase: 'validating-account', percent: 0 })
        const authStatus = await step(AuthManager.validateSelectedStatus())
        if (authStatus === 'invalid') {
            send({ phase: 'error', percent: 0, error: { code: 'AUTH_INVALID', message: 'Account session is no longer valid. Sign in again.' } })
            return
        }

        ConfigManager.ensureJavaConfig(selectedVersion.rawVersion.id, selectedVersion.effectiveJavaOptions, selectedVersion.rawVersion.javaOptions?.ram)
        let storedJavaExecutable = null
        try {
            storedJavaExecutable = await step(resolveJavaExecutable(selectedVersion, (phase, percent) => {
                if (launchState.cancelled || phase === 'ready') return
                send({ phase: phase === 'fetching-jdk' ? 'preparing-java' : phase, percent })
            }))
        } catch (javaErr) {
            if (launchState.cancelled) throw javaErr
            devLog('auto-java failed: ' + javaErr?.message)
            const isNetwork = /ENOTFOUND|ECONNREFUSED|ETIMEDOUT|EAI_AGAIN|fetch failed|network/i.test(String(javaErr?.code ?? '') + ' ' + String(javaErr?.message ?? ''))
            send({ phase: 'error', percent: 0, error: { code: isNetwork ? 'NEEDS_NETWORK' : 'JAVA_SETUP_FAILED', message: javaErr?.message || String(javaErr) } })
            return
        }
        if (!storedJavaExecutable) {
            send({ phase: 'error', percent: 0, error: { code: 'JAVA_NOT_CONFIGURED', message: 'No Java executable configured for this version yet.' } })
            return
        }
        // Autocuració: si el valor desat és l'arrel del JDK en comptes de l'executable (bug ja
        // arreglat a `java-detect`, però un valor dolent desat *abans* del fix es queda dolent per
        // sempre si ningú el normalitza en llegir-lo) — `ensureJavaDirIsRoot`+`javaExecFromRoot` és
        // idempotent (no fa res si `storedJavaExecutable` ja és l'executable correcte).
        const javaExecutable = javaExecFromRoot(ensureJavaDirIsRoot(storedJavaExecutable))
        if (javaExecutable !== storedJavaExecutable) {
            ConfigManager.setJavaExecutable(selectedVersion.rawVersion.id, javaExecutable)
        }
        devLog(`javaExecutable=${javaExecutable}`)
        // Mateix bug de fons que `ensureJavaConfig` (reportat per l'usuari, `Cannot read properties
        // of null (reading 'mods')`): `getModConfiguration` torna `null` fins que alguna cosa en
        // crea una entrada — a l'app antiga ho fa `syncModConfigurations` (uibinder.js) cada cop que
        // refresca la distribució, un pas que aquest flux no replica (Mods, pestanya no portada,
        // 2.3 §8). Un mapa buit és semànticament correcte per una versió mai personalitzada: cap
        // mod opcional té cap sobreescriptura, tots fan servir l'estat per defecte de la distribució.
        if (ConfigManager.getModConfiguration(selectedVersion.rawVersion.id) == null) {
            ConfigManager.setModConfiguration(selectedVersion.rawVersion.id, { id: selectedVersion.rawVersion.id, mods: {} })
        }
        ConfigManager.save()

        // B5: una sola reparació alhora (comparteixen `common/`). Si es cancel·la mentre s'espera, el pany es retorna sol.
        const lockPromise = acquireRepairLock().then((release) => {
            if (launchState.cancelled) { release(); return null }
            releaseRepairLock = release
            return release
        })
        await step(lockPromise)

        send({ phase: 'verifying-files', percent: 0 })
        const repair = new FullRepair(
            ConfigManager.getCommonDirectory(),
            ConfigManager.getInstanceDirectory(),
            ConfigManager.getLauncherDirectory(),
            selectedVersion.rawVersion.id,
            DistroAPI.isDevMode(),
            SIGNING_KEYS
        )
        launchState.repair = repair
        repair.spawnReceiver()
        await step(repair.verifyFiles((percent) => { if (!launchState.cancelled) send({ phase: 'verifying-files', percent }) }))

        send({ phase: 'downloading', percent: 0 })
        await step(repair.download((percent) => { if (!launchState.cancelled) send({ phase: 'downloading', percent }) }))
        repair.destroyReceiver()
        launchState.repair = null
        if (releaseRepairLock != null) { releaseRepairLock(); releaseRepairLock = null }

        throwIfCancelled()
        send({ phase: 'launching', percent: 100 })
        const mojangProcessor = new MojangIndexProcessor(ConfigManager.getCommonDirectory(), selectedVersion.rawVersion.minecraftVersion)
        const distroProcessor = new DistributionIndexProcessor(ConfigManager.getCommonDirectory(), distro, selectedVersion.rawVersion.id)
        const modLoaderData = await step(distroProcessor.loadModLoaderVersionJson(selectedVersion))
        const versionData = await step(mojangProcessor.getVersionJson())

        // D26 (06 §8.2): mateix punt on l'app antiga sincronitza `mods/` — `ProcessBuilder.build()`
        // (§93 avall) fa `fs.ensureDirSync(gameDir)` ell mateix, però cal `gameDir` ja creat *abans*
        // per poder-hi enllaçar els elements compartits, per això es garanteix aquí també (idempotent).
        const gameDir = getVersionInstanceDir(selectedVersion.rawVersion.id)
        fs.mkdirSync(gameDir, { recursive: true })
        await DataSharing.applyDataSharing(gameDir, selectedVersion.rawVersion, selectedVersion.rawVersion.id)

        // El servidor al qual es juga s'afegeix a la llista de «Multijugador» (`servers.dat`) si encara no hi és. Si la
        // versió comparteix dades, el fitxer és el mateix per a totes: en jugar a diversos servidors hi queden tots.
        // Va després de `applyDataSharing` perquè el fitxer ja sigui l'enllaç compartit. No bloqueja mai el llançament.
        const serversDatResult = ServersDat.ensureServer(gameDir, server)
        devLog(`servers.dat: ${serversDatResult.status}${serversDatResult.reason ? ` (${serversDatResult.reason})` : ''}`)

        writePresenceConfig(gameDir, distro.rawDistribution, server, selectedVersion.rawVersion)

        throwIfCancelled()
        const pb = new ProcessBuilder(selectedVersion, versionData, modLoaderData, account, app.getVersion(), server)
        const proc = pb.build()
        runningInstances.set(key, { id: key, versionId: target.versionId, serverId: target.serverId, startedAt: Date.now(), proc })
        broadcastInstances()
        syncMenuRpc()

        const startedAt = Date.now()
        let ended = false
        const onProcEnd = (exitCode, signal) => {
            if (ended) return
            ended = true
            runningInstances.delete(key)
            broadcastInstances()
            syncMenuRpc()
            // B6: els fitxers compartits (servers.dat, options.txt…) que el joc ha pogut canviar tornen a l'arrel compartida.
            DataSharing.syncBack(gameDir, selectedVersion.rawVersion, selectedVersion.rawVersion.id).catch(() => { /* ja registrat */ })
            // B9: sortida anormal (no l'ha tancat l'usuari des del launcher ni amb un senyal) → s'explica amb la cua del log.
            const killedByUs = signal != null || proc.killedByUs === true
            if (exitCode != null && exitCode !== 0 && !killedByUs) {
                const details = AppLog.tailFile(proc.gameOutputPath, 25)
                const latest = AppLog.tailFile(path.join(gameDir, 'logs', 'latest.log'), 25)
                devLog(`game exited with code ${exitCode} after ${Date.now() - startedAt} ms`)
                send({
                    phase: 'error',
                    percent: 0,
                    error: { code: 'GAME_EXITED', message: `Game exited with code ${exitCode}`, exitCode, details: details.length > 0 ? details : latest }
                })
            } else {
                send({ phase: 'closed', percent: 100 })
            }
        }
        proc.once('exit', onProcEnd)
        // `spawn` amb un executable inexistent/inaccessible falla de forma ASÍNCRONA (l'esdeveniment
        // 'error' del child, no una excepció síncrona) — sense escoltar-lo, l'error no passava mai
        // pel `catch` d'aquí baix i sortia com a excepció no capturada del procés principal (diàleg
        // natiu «A JavaScript error occurred», reportat per l'usuari amb un `ENOENT` de Java).
        proc.on('error', (spawnErr) => {
            devLog(`spawn error: ${spawnErr.message}`)
            ended = true
            runningInstances.delete(key)
            broadcastInstances()
            syncMenuRpc()
            send({ phase: 'error', percent: 0, error: { code: 'SPAWN_FAILED', message: spawnErr.message } })
        })

        send({ phase: 'ready', percent: 100 })
        applyOnGameStart(key)
    } catch (err) {
        if (launchState.repair) {
            launchState.repair.destroyReceiver()
            launchState.repair = null
        }
        if (launchState.cancelled || err?.message === 'LAUNCH_CANCELLED') {
            devLog('launch-start cancel·lat per l usuari')
            return
        }
        devLog(`launch-start failed: ${err?.stack || err}`)
        // 07 §11: sense connexió i versió no instal·lada → diàleg «Cal connexió» (no un error genèric).
        const networkCodes = ['ENOTFOUND', 'EAI_AGAIN', 'ETIMEDOUT', 'ECONNREFUSED', 'ECONNRESET', 'ENETUNREACH', 'EHOSTUNREACH']
        const isNetwork = networkCodes.some((c) => err?.code === c || String(err?.message).includes(c))
        send({ phase: 'error', percent: 0, error: { code: isNetwork ? 'NEEDS_NETWORK' : 'LAUNCH_FAILED', message: err?.message || String(err) } })
    } finally {
        if (releaseRepairLock != null) { releaseRepairLock(); releaseRepairLock = null }
        // Només si la clau encara és d'aquest llançament: després d'un cancel·lar, l'usuari pot haver-ne començat un de nou.
        if (launchingTargets.get(key) === launchState) launchingTargets.delete(key)
    }
})

// D13: què fa el launcher quan el joc ja està en marxa (Configuració > Launcher > «En iniciar el joc»).
// 'close' només si el joc és independent del launcher (`launchDetached`) i no hi ha cap altre llançament en curs; es tanca
// al cap de 10 s i només si la instància segueix viva (si el joc petés de seguida, el jugador ha de veure l'error).
function applyOnGameStart(key) {
    const mode = ConfigManager.getUiConfig().onGameStart
    if (mode === 'minimize' || mode === 'close') {
        if (win != null && !win.isDestroyed()) win.minimize()
    }
    if (mode === 'close' && ConfigManager.getLaunchDetached()) {
        setTimeout(() => {
            const othersLaunching = [...launchingTargets.keys()].some((k) => k !== key)
            if (runningInstances.has(key) && !othersLaunching) app.quit()
        }, 10000)
    }
}

ipcMain.handle('hellmc:launch-cancel', (_event, target) => {
    assertId(target?.versionId)
    assertId(target?.serverId, { nullable: true })
    const key = targetKey(target.versionId, target.serverId)
    const state = launchingTargets.get(key)
    if (state == null) return
    state.cancelled = true
    state.cancel()
    if (state.repair) {
        state.repair.destroyReceiver()
        state.repair = null
    }
    launchingTargets.delete(key)
})

// ── 2.11: instàncies en execució (llistar + tancar per la força) ─────────────────────────────
ipcMain.handle('hellmc:instances-list', () => instancesSnapshot())
ipcMain.handle('hellmc:instances-kill', (_event, id) => {
    if (typeof id !== 'string') return
    const instance = runningInstances.get(id)
    if (instance) {
        instance.proc.killedByUs = true
        instance.proc.kill()
    }
})

// ── 2.2: ping de servidors (real, socket directe) ─────────────────────────────────────────────
ipcMain.handle('hellmc:status-ping', async (_event, address) => {
    if (typeof address !== 'string' || address.length === 0 || address.length > 255) return { online: false }
    const parsed = parseAddress(address, 25565)
    if (parsed == null) {
        return { online: false }
    }
    try {
        const result = await pingJavaServer(parsed.host, parsed.port, { timeout: 3000 })
        return {
            online: true,
            players: { online: result.players.online, max: result.players.max },
            latencyMs: result.roundTripLatency
        }
    } catch {
        return { online: false }
    }
})

// ── 2.3: gestió de versions (instal·lar/verificar/desinstal·lar) ─────────────────────────────
// Carpeta d'instància per versió: mateixa convenció que `processbuilder.js:28`
// (`path.join(getInstanceDirectory(), versionId)`), mai un altre esquema inventat aquí.
function getVersionInstanceDir(versionId) {
    return path.join(ConfigManager.getInstanceDirectory(), versionId)
}
function getInstalledMarkerPath(versionId) {
    return path.join(getVersionInstanceDir(versionId), '.hellmc-installed.json')
}
// `hellmc-core` no exposa cap "quina revisió tinc instal·lada": es desa un marcador propi, senzill
// i fora de `config.json` (independent del que faci `ConfigManager`), només per saber si cal
// «Actualitzar» sense tornar a verificar tots els fitxers.
async function getDirectorySize(dir) {
    let total = 0
    let entries
    try {
        entries = await fs.promises.readdir(dir, { withFileTypes: true })
    } catch {
        return 0
    }
    for (const entry of entries) {
        const entryPath = path.join(dir, entry.name)
        if (entry.isDirectory()) {
            total += await getDirectorySize(entryPath)
        } else {
            try {
                total += (await fs.promises.stat(entryPath)).size
            } catch { /* esborrat just abans de llegir-lo, ignora */ }
        }
    }
    return total
}

const sizeCache = new Map() // versionId -> { size, at }
ipcMain.handle('hellmc:versions-status', async (_event, versionId) => {
    assertId(versionId)
    const gameDir = getVersionInstanceDir(versionId)
    if (!fs.existsSync(gameDir)) {
        // Ruta retornada igualment (07 §4.2 pt.4, pestanya Fitxers): és on s'instal·larà, útil
        // encara que «Obrir carpeta» no tingui gaire sentit fins que existeixi de veritat.
        return { installed: false, sizeBytes: 0, needsUpdate: false, path: gameDir }
    }
    // F3: recórrer tota la carpeta és car (milers de fitxers) i es demana des de moltes pantalles: es cacheja 5 min i
    // s'invalida en instal·lar/verificar/desinstal·lar.
    const cached = sizeCache.get(versionId)
    let sizeBytes
    if (cached != null && Date.now() - cached.at < 5 * 60 * 1000) {
        sizeBytes = cached.size
    } else {
        sizeBytes = await getDirectorySize(gameDir)
        sizeCache.set(versionId, { size: sizeBytes, at: Date.now() })
    }
    let installedRevision = null
    try {
        installedRevision = JSON.parse(fs.readFileSync(getInstalledMarkerPath(versionId), 'utf-8')).revision
    } catch { /* mai instal·lada amb aquest mecanisme (carpeta òrfena o versió anterior) */ }
    const distro = await DistroAPI.getDistribution()
    const current = distro.getVersionById(versionId)
    const needsUpdate = current != null && installedRevision != null && installedRevision !== current.rawVersion.version
    return { installed: true, sizeBytes, needsUpdate, path: gameDir }
})

// Reutilitzat tant per `install` com per `verify`: `FullRepair` ja és el "verifica i arregla el que
// calgui" (07 §4.3, «Verificar/Reparar: reutilitza el flux de reparació actual») — `hellmc-core` no
// distingeix un mode "només comprovar" d'un "comprovar i baixar".
async function performRepair(versionId, onProgress) {
    const distro = await DistroAPI.getDistribution()
    const selectedVersion = distro.getVersionById(versionId)
    if (selectedVersion == null) {
        throw new Error(`Version ${versionId} not found in distribution.`)
    }
    const repair = new FullRepair(
        ConfigManager.getCommonDirectory(),
        ConfigManager.getInstanceDirectory(),
        ConfigManager.getLauncherDirectory(),
        versionId,
        DistroAPI.isDevMode(),
        SIGNING_KEYS
    )
    repair.spawnReceiver()
    try {
        onProgress({ percent: 0, message: 'verifying-files' })
        await repair.verifyFiles((percent) => onProgress({ percent, message: 'verifying-files' }))
        onProgress({ percent: 0, message: 'downloading' })
        await repair.download((percent) => onProgress({ percent, message: 'downloading' }))
    } finally {
        repair.destroyReceiver()
    }
    fs.mkdirSync(getVersionInstanceDir(versionId), { recursive: true })
    fs.writeFileSync(getInstalledMarkerPath(versionId), JSON.stringify({ revision: selectedVersion.rawVersion.version }))
}

function makeVersionsProgressSender(event, versionId) {
    const sender = event.sender
    return (progress) => { if (!sender.isDestroyed()) sender.send('hellmc:versions-progress', versionId, progress) }
}

async function runRepairOp(kind, event, versionId) {
    const endOp = beginVersionOp(versionId, kind)
    const releaseLock = await acquireRepairLock()
    try {
        await performRepair(versionId, makeVersionsProgressSender(event, versionId))
    } finally {
        releaseLock()
        endOp()
        sizeCache.delete(versionId)
    }
}
ipcMain.handle('hellmc:versions-install', (event, versionId) => runRepairOp('install', event, versionId))
ipcMain.handle('hellmc:versions-verify', (event, versionId) => runRepairOp('verify', event, versionId))
ipcMain.handle('hellmc:versions-uninstall', async (_event, versionId) => {
    // S4/B5: només versions de la distribució (mai un camí lliure) i mai amb el joc en marxa o una altra operació en curs.
    const distro = await DistroAPI.getDistribution()
    if (distro.getVersionById(versionId) == null) throw new Error('VERSION_NOT_FOUND')
    const endOp = beginVersionOp(versionId, 'uninstall')
    try {
        await uninstallVersion(versionId)
    } finally {
        endOp()
        sizeCache.delete(versionId)
    }
})
async function uninstallVersion(versionId) {
    // 09 P6: esborra mods/libraries/config gestionada, però conserva les dades del jugador —
    // exactament la llista de D26 (`DataSharing.SHAREABLE_NAMES`, 01 §3.1.1), no un duplicat propi:
    // quan un d'aquests noms és un enllaç (`shared`), mai s'ha d'esborrar per sota, encara que
    // `fs.rm` amb `recursive` en teoria només hauria de treure l'enllaç i no el contingut real.
    const PRESERVE = new Set(DataSharing.SHAREABLE_NAMES)
    const gameDir = getVersionInstanceDir(versionId)
    if (!fs.existsSync(gameDir)) return
    const entries = await fs.promises.readdir(gameDir)
    await Promise.all(
        entries
            .filter((name) => !PRESERVE.has(name))
            .map((name) => fs.promises.rm(path.join(gameDir, name), { recursive: true, force: true }))
    )
}

// ── 2.3: dades compartides entre versions (D26, 06 §8.2/07 §4.4/§6.2) ───────────────────────────
function getSystemMinecraftDir() {
    if (process.platform === 'win32') return path.join(process.env.APPDATA, '.minecraft')
    if (process.platform === 'darwin') return path.join(os.homedir(), 'Library', 'Application Support', 'minecraft')
    return path.join(os.homedir(), '.minecraft')
}
ipcMain.handle('hellmc:datasharing-get-preference', async (_event, versionId) => {
    const distro = await DistroAPI.getDistribution()
    const rawVersion = distro.getVersionById(versionId)?.rawVersion ?? null
    return {
        shared: DataSharing.isEffectivelyShared(rawVersion, versionId),
        forced: rawVersion?.dataSharing === 'forcedSeparate'
    }
})
ipcMain.handle('hellmc:datasharing-set-preference', async (_event, versionId, shared) => {
    assertId(versionId)
    if (typeof shared !== 'boolean') throw new Error('INVALID_VALUE')
    ConfigManager.setDataSharingPreference(versionId, shared)
    ConfigManager.save()
})
ipcMain.handle('hellmc:datasharing-get-root', async () => {
    const current = ConfigManager.getSharedDataRoot()
    // «Sistema» només si la ruta desada coincideix *exactament* amb la `.minecraft` real d'aquesta
    // màquina — si l'usuari mai l'ha triat, `getSharedDataRoot()` ja torna la per defecte (HellMC).
    return { mode: current === getSystemMinecraftDir() ? 'system' : 'hellmc', path: current }
})
ipcMain.handle('hellmc:datasharing-set-root', async (_event, mode) => {
    ConfigManager.setSharedDataRoot(mode === 'system' ? getSystemMinecraftDir() : null)
    ConfigManager.save()
})

// ── 2.3: pestanya Mods (grups de dependències, `docs/mod-dependency-groups`) ────────────────────
// `ModGroups`/`enforceModDependencies` (`processbuilder.js`) ja funcionaven — implementats i provats
// a la sessió 2026-09-24, abans de començar Fase 2 — la UI antiga (`settings.js`) ja els fa servir i
// `ProcessBuilder.build()` ja crida `enforceModDependencies` a cada llançament (2.1 §6). Aquí només
// cal exposar el graf i l'estat via IPC perquè el renderer nou en pinti la seva pròpia UI (07 §4.2
// pt.2) — la lògica de grup (`renderer/src/utils/modgroups.ts`) és un port fidel del mateix
// `app/assets/js/modgroups.js`, no una reimplementació (veure nota de sincronització en aquell
// fitxer): és pura i sense dependències Node, però CommonJS/UMD aquí i ESM al renderer Vite, no hi
// ha una manera neta d'importar-la des de tots dos costats sense tocar el sistema de mòduls de tot
// el repo per una sola peça de 07 §4.2.
const MOD_TYPES = [Type.ForgeMod, Type.LiteMod, Type.LiteLoader, Type.FabricMod]
ipcMain.handle('hellmc:mods-list', async (_event, versionId) => {
    const distro = await DistroAPI.getDistribution()
    const version = distro.getVersionById(versionId)
    if (version == null) return []
    return version.modules
        .filter((m) => MOD_TYPES.includes(m.rawModule.type))
        // HellMC-Presence és infraestructura (Discord RPC en partida, P17): mod obligatori i **ocult**.
        .filter((m) => !PRESENCE_MOD_RE.test(m.rawModule.id))
        .map((m) => ({
            id: m.rawModule.id,
            key: m.getVersionlessMavenIdentifier(),
            name: m.rawModule.name,
            required: !!m.getRequired().value,
            dependencies: m.rawModule.dependencies || []
        }))
})
ipcMain.handle('hellmc:mods-get-state', async (_event, versionId) => {
    const distro = await DistroAPI.getDistribution()
    const version = distro.getVersionById(versionId)
    if (version == null) return {}
    const mods = ConfigManager.getModConfiguration(versionId)?.mods ?? {}
    const state = {}
    for (const m of version.modules) {
        if (!MOD_TYPES.includes(m.rawModule.type)) continue
        // `ProcessBuilder.isModEnabled` és la mateixa funció que decideix què es carrega de veritat
        // al llançament — l'estat que la pestanya mostra ha de coincidir exactament, no un càlcul
        // propi que es pugui desincronitzar.
        state[m.getVersionlessMavenIdentifier()] = ProcessBuilder.isModEnabled(mods[m.getVersionlessMavenIdentifier()], m.getRequired())
    }
    return state
})
ipcMain.handle('hellmc:mods-set-state', async (_event, versionId, patch) => {
    // Mai reemplaça `mods` sencer: una entrada existent pot ser un objecte amb `mods` niats (un mod
    // amb `subModules`, 07 §4.2 no els representa aquí, però no s'han de perdre) — només se
    // n'actualitza `.value`, mateix criteri que `enforceModDependencies` (`processbuilder.js`).
    const mods = ConfigManager.getModConfiguration(versionId)?.mods ?? {}
    for (const [key, value] of Object.entries(patch)) {
        const cur = mods[key]
        mods[key] = cur != null && typeof cur === 'object' ? { ...cur, value } : value
    }
    ConfigManager.setModConfiguration(versionId, { id: versionId, mods })
    ConfigManager.save()
})

// ── 2.3: Java i RAM per versió (`config.getVersion`/`setVersion`, `java.detect`/`pick`) ────────
// Cal `ensureJavaConfig` (idempotent, `configmanager.js:614-618`) abans de llegir/escriure res de
// `javaConfig[versionId]` la primera vegada — sense això `getMinRAM`/etc peten (accedeixen a
// `config.javaConfig[versionid].X` directament, sense comprovar que existeixi l'entrada). Bug real
// d'aquesta sessió: es va escriure aquest comentari i la funció, però es va oblidar cridar-la des
// de `config-get-version`/`config-set-version` — només `java-detect` la feia servir. Reportat per
// l'usuari: `TypeError: Cannot read properties of undefined (reading 'minRAM')` en obrir la
// pestanya Java i memòria (i, en conseqüència, `JAVA_NOT_CONFIGURED` en prémer Jugar, perquè mai
// s'arribava a desar cap executable).
async function ensureJavaConfigForVersion(versionId) {
    const distro = await DistroAPI.getDistribution()
    const selectedVersion = distro.getVersionById(versionId)
    if (selectedVersion == null) return null
    ConfigManager.ensureJavaConfig(versionId, selectedVersion.effectiveJavaOptions, selectedVersion.rawVersion.javaOptions?.ram)
    return selectedVersion
}
ipcMain.handle('hellmc:config-get-version', async (_event, versionId) => {
    assertId(versionId)
    if ((await ensureJavaConfigForVersion(versionId)) == null) throw new Error('VERSION_NOT_FOUND')
    return {
        minRAM: ConfigManager.getMinRAM(versionId),
        maxRAM: ConfigManager.getMaxRAM(versionId),
        executable: ConfigManager.getJavaExecutable(versionId),
        jvmOptions: ConfigManager.getJVMOptions(versionId),
        forceExecutable: ConfigManager.getJavaForced(versionId)
    }
})
ipcMain.handle('hellmc:config-set-version', async (_event, versionId, patch) => {
    assertId(versionId)
    if ((await ensureJavaConfigForVersion(versionId)) == null) throw new Error('VERSION_NOT_FOUND')
    if (patch == null || typeof patch !== 'object') throw new Error('INVALID_VALUE')
    devLog(`config-set-version ${versionId} patch=${JSON.stringify(patch)}`)
    // B11: només valors de memòria vàlids per a la JVM (`512M`, `4G`); mai text lliure dins `-Xmx`/`-Xms`.
    const ramRe = /^[1-9]\d{0,5}[MG]$/
    if (patch.minRAM != null && ramRe.test(patch.minRAM)) ConfigManager.setMinRAM(versionId, patch.minRAM)
    if (patch.maxRAM != null && ramRe.test(patch.maxRAM)) ConfigManager.setMaxRAM(versionId, patch.maxRAM)
    // S4: l'executable ha de ser un fitxer de Java existent; les opcions de JVM que carreguen codi només amb el mode desenvolupador.
    if (patch.executable != null) {
        if (typeof patch.executable !== 'string' || !isJavaExecPath(patch.executable) || !fs.existsSync(patch.executable)) throw new Error('INVALID_JAVA_EXECUTABLE')
        ConfigManager.setJavaExecutable(versionId, patch.executable)
    }
    if (typeof patch.forceExecutable === 'boolean') ConfigManager.setJavaForced(versionId, patch.forceExecutable)
    if (patch.jvmOptions != null) {
        const checked = Security.validateJvmOptions(patch.jvmOptions, ConfigManager.getUiConfig()?.devMode === true)
        if (!checked.ok) throw new Error(`INVALID_JVM_OPTIONS:${checked.reason}`)
        ConfigManager.setJVMOptions(versionId, checked.options)
    }
    ConfigManager.save()
})
ipcMain.handle('hellmc:java-detect', async (_event, versionId) => {
    const selectedVersion = await ensureJavaConfigForVersion(versionId)
    if (selectedVersion == null) return { available: false }
    const semverRange = selectedVersion.effectiveJavaOptions.supported
    devLog(`java-detect ${versionId} semverRange=${semverRange}`)
    const existing = ConfigManager.getJavaExecutable(versionId)
    if (existing) {
        // `validateSelectedJvm` valida igual de bé l'arrel que l'executable (crida
        // `getHotSpotSettings` internament, que deu normalitzar-ho ell sol) — **no es pot fer
        // servir el seu veredicte per decidir si `existing` ja té la forma correcta**. Bug real
        // reportat per l'usuari: com que un cop es va desar l'arrel (per l'altre bug, ja arreglat
        // més amunt), `validateSelectedJvm(arrel, ...)` seguia tornant "vàlid" per sempre —
        // `java-detect` no es curava mai sol, calia normalitzar `existing` abans de confiar-hi,
        // exactament igual que `found.path` uns quants línies més avall.
        const normalizedExisting = javaExecFromRoot(ensureJavaDirIsRoot(existing))
        const valid = await validateSelectedJvm(normalizedExisting, semverRange)
        devLog(`existing=${existing} normalized=${normalizedExisting} valid=${JSON.stringify(valid)}`)
        if (valid != null) {
            if (normalizedExisting !== existing) {
                ConfigManager.setJavaExecutable(versionId, normalizedExisting)
                ConfigManager.save()
            }
            return { available: true, path: normalizedExisting, version: valid.semverStr }
        }
    }
    if (existing && ConfigManager.getJavaForced(versionId) && fs.existsSync(javaExecFromRoot(ensureJavaDirIsRoot(existing)))) {
        return { available: true, path: javaExecFromRoot(ensureJavaDirIsRoot(existing)), version: undefined }
    }
    const found = await discoverBestJvmInstallation(ConfigManager.getDataDirectory(), semverRange)
    devLog(`discoverBestJvmInstallation -> ${JSON.stringify(found)}`)
    if (found == null) return { available: false }
    // `found.path` és l'arrel de la instal·lació JDK, no l'executable — mateixa conversió que
    // `landing.js:292` (`JavaUtils.javaExecFromRoot(jvmDetails.path)`) abans de desar-lo.
    const executable = javaExecFromRoot(found.path)
    ConfigManager.setJavaExecutable(versionId, executable)
    ConfigManager.setJavaForced(versionId, false)
    ConfigManager.save()
    return { available: true, path: executable, version: found.semverStr }
})
ipcMain.handle('hellmc:java-pick', async (event) => {
    const senderWin = BrowserWindow.fromWebContents(event.sender)
    const result = await dialog.showOpenDialog(senderWin, {
        properties: ['openFile'],
        filters: process.platform === 'win32' ? [{ name: 'Java', extensions: ['exe'] }] : undefined
    })
    if (result.canceled || result.filePaths.length === 0) return null
    let picked = result.filePaths[0]
    if (!isJavaExecPath(picked)) {
        picked = javaExecFromRoot(ensureJavaDirIsRoot(picked))
    }
    return fs.existsSync(picked) ? picked : null
})

// 2.5 (Configuració > Java, «versions de Java detectades» + «ruta personalitzada global»): no
// toca cap configuració per versió (`javaConfig[versionId]`) — `getGlobalJavaExecutable`/
// `setGlobalJavaExecutable` només serveixen de llavor per a versions **noves** (`defaultJavaConfig*`,
// `configmanager.js`); una versió ja configurada no es veu afectada en canviar-ho.
ipcMain.handle('hellmc:java-list-installations', async () => {
    const dataDir = ConfigManager.getDataDirectory()
    const paths = await getValidatableJavaPaths(dataDir)
    const resolved = await resolveJvmSettings(paths)
    // `>=8` (sense límit superior): aquí es vol mostrar **tot** el que hi ha instal·lat, no filtrar
    // per la versió de Minecraft d'una versió concreta (que és el que fa `java-detect`).
    const details = filterApplicableJavaPaths(resolved, '>=8')
    rankApplicableJvms(details)
    // Dedup: el mateix JDK arriba per rutes diferents (`\Program Files\...` sense lletra de unitat i
    // `C:\Program Files\...`, registre + carpetes conegudes). `path.resolve` hi afegeix la unitat;
    // `realpath` resol enllaços; Windows/macOS no distingeixen majúscules.
    const seen = new Set()
    const unique = []
    for (const d of details) {
        let key = path.resolve(d.path)
        try { key = fs.realpathSync.native(key) } catch { /* ruta inexistent: es queda el resolt */ }
        if (process.platform !== 'linux') key = key.toLowerCase()
        if (seen.has(key)) continue
        seen.add(key)
        unique.push(d)
    }
    return unique.map((d) => ({ path: path.resolve(d.path), version: d.semverStr, vendor: d.vendor }))
})
ipcMain.handle('hellmc:java-global-get', () => ConfigManager.getGlobalJavaExecutable())
ipcMain.handle('hellmc:java-global-set', (_event, executable) => {
    if (executable != null && (typeof executable !== 'string' || !isJavaExecPath(executable) || !fs.existsSync(executable))) throw new Error('INVALID_JAVA_EXECUTABLE')
    ConfigManager.setGlobalJavaExecutable(executable)
    ConfigManager.save()
})

// 2.3: baixada automàtica de JDK quan `java-detect` no en troba cap de compatible (l'únic tros de
// 2.3 que quedava «pendent confirmat, no oblidat» a `11-progres-fase2.md` §Estat global). Mateixa
// lògica que `landing.js:downloadJava` (app antiga), mai reimplementada: `latestOpenJDK` tria
// l'asset (Temurin/Corretto segons plataforma, resolt per `effectiveJavaOptions.distribution`),
// `downloadFile` (mateix `hellmc-core/dl` que `FullRepair`) el baixa, `extractJdk` el descomprimeix
// i ja retorna l'**executable** (no l'arrel — a diferència de `discoverBestJvmInstallation`, no cal
// `javaExecFromRoot` aquí, `JavaGuard.js:extractJdk` ja hi passa per dins).
// Baixa i descomprimeix el JDK adequat per a una versió i el desa com a executable seu. Compartit entre
// `hellmc:java-download` (botó a Configuració) i el flux de Jugar (`resolveJavaExecutable`).
// `report(phase, percent)`: 'fetching-jdk' | 'downloading-java' | 'extracting-java' | 'ready'.
async function downloadJdkForVersion(versionId, selectedVersion, report) {
    const { suggestedMajor, supported: semverRange, distribution: jdkDistribution } = selectedVersion.effectiveJavaOptions
    devLog(`java-download ${versionId} suggestedMajor=${suggestedMajor} distribution=${jdkDistribution}`)

    report('fetching-jdk', 0)
    const asset = await latestOpenJDK(suggestedMajor, ConfigManager.getDataDirectory(), jdkDistribution)
    if (asset == null) {
        throw new Error('JDK_FETCH_FAILED')
    }

    report('downloading-java', 0)
    await downloadFile(asset.url, asset.path, (progress) => {
        report('downloading-java', Math.trunc((progress.percent ?? 0) * 100))
    })
    report('downloading-java', 100)

    // `hash` és opcional als `Asset` no rastrejats (`dl/Asset.d.ts`) — aquí sempre hi és (ve
    // d'Adoptium/Corretto), però es comprova igualment per no assumir-ho a cegues.
    if (asset.hash != null && !(await validateLocalFile(asset.path, asset.algo, asset.hash))) {
        devLog(`java-download corrupted: ${asset.path}`)
        throw new Error('JAVA_DOWNLOAD_CORRUPTED')
    }

    report('extracting-java', 0)
    const newJavaExec = await extractJdk(asset.path)
    devLog(`java-download extracted -> ${newJavaExec}`)

    ConfigManager.setJavaExecutable(versionId, newJavaExec)
    ConfigManager.setJavaForced(versionId, false)
    ConfigManager.save()

    const info = await validateSelectedJvm(newJavaExec, semverRange)
    report('ready', 100)
    return { available: true, path: newJavaExec, version: info?.semverStr }
}

ipcMain.handle('hellmc:java-download', async (event, versionId) => {
    const selectedVersion = await ensureJavaConfigForVersion(versionId)
    if (selectedVersion == null) {
        throw new Error(`Version ${versionId} not found in distribution.`)
    }
    const sender = event.sender
    return downloadJdkForVersion(versionId, selectedVersion, (phase, percent) => {
        if (!sender.isDestroyed()) sender.send('hellmc:java-download-progress', versionId, { phase, percent })
    })
})

// Proveïdors de JDK de `javaOptions.distribution` → text del `vendor` que informa el JDK instal·lat.
const JDK_VENDOR_PATTERNS = { TEMURIN: /adoptium|temurin|eclipse/i, CORRETTO: /amazon|corretto/i }

/**
 * Jugar sense Java configurat (o amb un de no vàlid): es resol sol, sense preguntar.
 *   1. El Java ja desat per a la versió, si és vàlid per al rang de la versió.
 *   2. Un JDK instal·lat al PC que compleixi el rang. Si la versió **exigeix** un proveïdor
 *      (`javaOptions.distribution` explícit), només val un d'aquest proveïdor.
 *   3. Si no n'hi ha cap, es baixa el que indica la versió (proveïdor i versió major).
 * Retorna l'executable (ja desat a la config) o llança si no s'ha pogut obtenir.
 */
async function resolveJavaExecutable(selectedVersion, report) {
    const versionId = selectedVersion.rawVersion.id
    const semverRange = selectedVersion.effectiveJavaOptions.supported

    const stored = ConfigManager.getJavaExecutable(versionId)
    // B13: un Java triat a mà (forçat) es respecta encara que no compleixi el rang de la versió, mentre existeixi.
    if (stored && ConfigManager.getJavaForced(versionId) && fs.existsSync(javaExecFromRoot(ensureJavaDirIsRoot(stored)))) {
        return javaExecFromRoot(ensureJavaDirIsRoot(stored))
    }
    if (stored) {
        const normalized = javaExecFromRoot(ensureJavaDirIsRoot(stored))
        if ((await validateSelectedJvm(normalized, semverRange)) != null) return normalized
    }

    const requiredVendor = selectedVersion.rawVersion.javaOptions?.distribution
    const vendorPattern = requiredVendor != null ? JDK_VENDOR_PATTERNS[requiredVendor] : null
    report('fetching-jdk', 0)
    const paths = await getValidatableJavaPaths(ConfigManager.getDataDirectory())
    const details = filterApplicableJavaPaths(await resolveJvmSettings(paths), semverRange)
    rankApplicableJvms(details)
    const found = details.find((d) => vendorPattern == null || vendorPattern.test(d.vendor ?? ''))
    if (found != null) {
        const executable = javaExecFromRoot(found.path)
        devLog(`auto-java ${versionId}: instal·lat ${executable} (${found.vendor} ${found.semverStr})`)
        ConfigManager.setJavaExecutable(versionId, executable)
        ConfigManager.save()
        return executable
    }

    devLog(`auto-java ${versionId}: cap JDK compatible instal·lat (proveïdor ${requiredVendor ?? 'qualsevol'}), es baixa`)
    const downloaded = await downloadJdkForVersion(versionId, selectedVersion, report)
    return downloaded.path
}

// ── 2.4 (bàsic): notícies (RSS global + per servidor, amb cache per a D24 sense connexió) ──────
function getNewsCachePath() {
    return path.join(ConfigManager.getLauncherDirectory(), 'newscache.json')
}
function readNewsCache() {
    try {
        return JSON.parse(fs.readFileSync(getNewsCachePath(), 'utf-8'))
    } catch {
        return {}
    }
}
function writeNewsCacheEntry(scopeKey, entry) {
    const cache = readNewsCache()
    cache[scopeKey] = entry
    try {
        fs.writeFileSync(getNewsCachePath(), JSON.stringify(cache))
    } catch { /* millor perdre la cache que petar la resposta */ }
}

// S11: baixada del feed amb https obligatori, amfitrió públic, *timeout* i límit de mida (2 MB) abans de passar-ho a `rss-parser`.
const MAX_FEED_BYTES = 2 * 1024 * 1024
async function fetchFeed(rawUrl) {
    const url = Security.safeFeedUrl(rawUrl)
    if (url == null) throw new Error('FEED_URL_NOT_ALLOWED')
    const response = await fetch(url, { signal: AbortSignal.timeout(8000), headers: { accept: 'application/rss+xml, application/atom+xml, application/xml, text/xml, */*' } })
    if (!response.ok) throw new Error(`FEED_HTTP_${response.status}`)
    const reader = response.body.getReader()
    const chunks = []
    let total = 0
    for (;;) {
        const { done, value } = await reader.read()
        if (done) break
        total += value.length
        if (total > MAX_FEED_BYTES) {
            await reader.cancel()
            throw new Error('FEED_TOO_LARGE')
        }
        chunks.push(value)
    }
    return rssParser.parseString(Buffer.concat(chunks).toString('utf8'))
}

function normalizeFeedItem(item, feedUrl) {
    const dateStr = item.isoDate ?? item.pubDate
    const date = dateStr != null ? Date.parse(dateStr) : Number.NaN
    return {
        // L'id inclou el feed: dues fonts amb el mateix `guid` no han de col·lidir a la llista de la UI.
        id: `${feedUrl}|${item.guid ?? item.link ?? `${item.title ?? ''}#${date}`}`,
        title: item.title ?? '',
        date: Number.isNaN(date) ? Date.now() : date,
        url: item.link ?? feedUrl,
        summary: item.contentSnippet ?? item.summary,
        // 2.4 completes (07 §5): calien per a l'autor i el lector dins l'app — `news-get` (2.1/2.2)
        // mai els havia necessitat (només la targeta Jugar/detall de servidor, cap lectura completa).
        author: item.creator ?? item.author,
        // Acotat: el contingut complet es desa a `newscache.json` i es pinta; un feed enorme no ha d'inflar res.
        content: String(item.content ?? item.contentSnippet ?? item.summary ?? '').slice(0, 100_000)
    }
}

// Extret de l'antic `hellmc:news-get` perquè `hellmc:news-archive` (tots els orígens alhora, 07 §5)
// el reutilitzi sense duplicar el fetch+cache per origen — un sol lloc que sap parlar amb
// `rss-parser` i la cache de disc.
async function fetchNewsSource(scopeKey, feedUrls) {
    const activeFeedUrls = feedUrls.filter((url) => url != null)
    if (activeFeedUrls.length === 0) {
        return { items: [], fromCache: false, fetchedAt: Date.now() }
    }
    const results = await Promise.allSettled(activeFeedUrls.map((url) => fetchFeed(url)))
    const items = []
    let anySucceeded = false
    results.forEach((result, i) => {
        if (result.status === 'fulfilled') {
            anySucceeded = true
            for (const item of result.value.items) items.push(normalizeFeedItem(item, activeFeedUrls[i]))
        }
    })
    if (!anySucceeded) {
        const cached = readNewsCache()[scopeKey]
        if (cached != null) return { items: cached.items, fromCache: true, fetchedAt: cached.fetchedAt }
        return { items: [], fromCache: false, fetchedAt: Date.now() }
    }
    items.sort((a, b) => b.date - a.date)
    items.splice(50)
    const fetchedAt = Date.now()
    writeNewsCacheEntry(scopeKey, { items, fetchedAt })
    return { items, fromCache: false, fetchedAt }
}

ipcMain.handle('hellmc:news-get', async (_event, scope) => {
    assertId(scope?.serverId, { nullable: true })
    const distro = await DistroAPI.getDistribution()
    const feedUrls = [distro.rawDistribution.rss]
    if (scope?.serverId != null) {
        const server = distro.rawDistribution.servers.find((s) => s.id === scope.serverId)
        if (server?.rss != null) feedUrls.push(server.rss)
    }
    return fetchNewsSource(scope?.serverId ?? 'global', feedUrls)
})

// Totes les fonts (07 §5, arxiu complet): `'global'` + un origen per servidor amb `rss` propi —
// mai fusionats en un sol feed (a diferència de `news-get`, que sí fusiona global+servidor per a la
// secció d'un `ServerDetail`, 2.2/§9): l'arxiu necessita saber de QUIN origen és cada article per
// poder-lo filtrar per pestanya.
function getNewsSources(distro) {
    const sources = [{ id: 'global', name: null, url: distro.rawDistribution.rss }]
    for (const server of distro.rawDistribution.servers ?? []) {
        if (server.rss != null) sources.push({ id: server.id, name: server.name, url: server.rss })
    }
    return sources.filter((s) => s.url != null)
}

ipcMain.handle('hellmc:news-archive', async () => {
    const distro = await DistroAPI.getDistribution()
    const sources = getNewsSources(distro)
    const results = await Promise.all(sources.map((s) => fetchNewsSource(s.id, [s.url])))

    const items = []
    let fromCache = false
    let oldestFetchedAt = null
    results.forEach((result, i) => {
        const source = sources[i]
        const lastSeen = ConfigManager.getNewsLastSeen(source.id)
        for (const item of result.items) {
            items.push({ ...item, source: { id: source.id, name: source.name }, unread: item.date > lastSeen })
        }
        if (result.fromCache) {
            fromCache = true
            if (oldestFetchedAt == null || result.fetchedAt < oldestFetchedAt) oldestFetchedAt = result.fetchedAt
        }
    })
    items.sort((a, b) => b.date - a.date)

    return {
        items,
        sources: sources.map((s) => ({ id: s.id, name: s.name })),
        fromCache,
        fetchedAt: fromCache ? oldestFetchedAt : Date.now()
    }
})

// Marca com a «vist» **ara** cada origen — cridat pel renderer just després de carregar l'arxiu
// (mai en obtenir-lo, són passos separats a propòsit: primer es mostra què hi ha de nou, després es
// marca com a llegit). Article publicat després d'aquest moment → `unread` al proper `news-archive`.
ipcMain.handle('hellmc:news-mark-read', async () => {
    const distro = await DistroAPI.getDistribution()
    const now = Date.now()
    for (const source of getNewsSources(distro)) {
        ConfigManager.setNewsLastSeen(source.id, now)
    }
    ConfigManager.save()
})

function getPlatformIcon(filename) {
    let ext
    switch (process.platform) {
        case 'win32':
            ext = 'ico'
            break
        case 'darwin':
        case 'linux':
        default:
            ext = 'png'
            break
    }

    return path.join(__dirname, 'app', 'assets', 'images', `${filename}.${ext}`)
}

// B3: carpetes temporals de natives que es van quedar si el launcher es va tancar abans que el joc. Només les de > 2 dies,
// perquè un joc obert d'una sessió anterior (launchDetached) encara pot estar-les fent servir.
function cleanStaleNatives() {
    for (const folder of [ConfigManager.getTempNativeFolder(), 'WCNatives']) cleanStaleNativesIn(path.join(os.tmpdir(), folder))
}
function cleanStaleNativesIn(base) {
    fs.promises.readdir(base).then(async (names) => {
        const limit = Date.now() - 2 * 24 * 60 * 60 * 1000
        for (const name of names) {
            const dir = path.join(base, name)
            try {
                if ((await fs.promises.stat(dir)).mtimeMs < limit) await fs.promises.rm(dir, { recursive: true, force: true })
            } catch { /* en ús o ja esborrada */ }
        }
    }).catch(() => { /* no existeix la carpeta: res a netejar */ })
}

// S10: cap permís del navegador (càmera, geolocalització, notificacions…) per a cap finestra, cap <webview>, i cap navegació a
// esquemes que no siguin https (les finestres de Microsoft) ni al propi renderer.
app.on('web-contents-created', (_event, contents) => {
    contents.session.setPermissionRequestHandler((_webContents, _permission, callback) => callback(false))
    contents.on('will-attach-webview', (event) => event.preventDefault())
    contents.on('will-navigate', (event, url) => {
        const own = url.toLowerCase().startsWith(RENDERER_ORIGIN) || (process.env.RENDERER_DEV_SERVER === '1' && url.startsWith('http://localhost:5173'))
        if (!own && !url.startsWith('https://')) event.preventDefault()
    })
})

// S5: desxifra els tokens abans de res més (cap finestra ni handler els necessita abans).
app.on('ready', () => ConfigManager.unlockSecrets())
app.on('ready', () => Telemetry.start())
app.on('ready', createWindow)
app.on('ready', createMenu)
app.on('ready', cleanStaleNatives)

// 2.5: comprovació silenciosa a l'arrencada — Discord-style, mai depèn que l'usuari premi
// «Comprova ara».
// Repetit cada hora (no en `isDev`, per no martellejar `dev-app-update.yml`/xarxa mentre es
// desenvolupa) — sense cap temporitzador més curt, coherent amb 06 §10 «cap polling innecessari»
// a la resta de la Fase 2.
app.on('ready', () => {
    configureAutoUpdater(ConfigManager.getAllowPrerelease())
    autoUpdater.checkForUpdates().catch(() => { /* ja reportat via l'esdeveniment 'error' */ })
    if (!isDev) {
        setInterval(() => {
            autoUpdater.checkForUpdates().catch(() => { /* ja reportat via l'esdeveniment 'error' */ })
        }, 60 * 60 * 1000)
    }
})

app.on('window-all-closed', () => {
    // On macOS it is common for applications and their menu bar
    // to stay active until the user quits explicitly with Cmd + Q
    if (process.platform !== 'darwin') {
        app.quit()
    }
})

app.on('activate', () => {
    // On macOS it's common to re-create a window in the app when the
    // dock icon is clicked and there are no other windows open.
    if (win === null) {
        createWindow()
    }
})