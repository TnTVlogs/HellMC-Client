'use strict'
// HellMC Client: punt d'entrada del procés principal d'Electron.
//
// La lògica viu a `src-node/main/`, un mòdul per domini (cada un registra els seus handlers IPC en carregar-se):
//   core        infraestructura: requires d'Electron/Node, confiança dels missatges IPC, logs, errors, configuració i gestors
//   window      finestra principal i menú             updater   actualitzacions automàtiques
//   auth        comptes i inici de sessió Microsoft    legal     termes, privacitat, telemetria i informes d'errors
//   system      sistema (camins, enllaços, diagnòstic, configuració del joc)
//   distro      distribució i selecció recordada       presence  Discord Rich Presence
//   skins       skins i capes                          wardrobe  armari (cosmètics i emotes)
//   runtime     HellMC Runtime, relay i token          social    amics
//   launch      llançament del joc                     instances estat de les instàncies en execució
//   versions    gestió de versions                     mods / java / servers / news
// Aquí només hi ha el que és de l'aplicació sencera: instància única, acceleració i esdeveniments del cicle de vida.

// 1) Infraestructura: instal·la el filtre de confiança dels missatges IPC i els logs. Ha d'anar abans de tot el que registri handlers.
const { app, ConfigManager, reportError, RENDERER_ORIGIN, Telemetry, ErrorReports, autoUpdater, isDev } = require('./src-node/main/core')

// 2) Una sola instància: dues finestres compartirien (i trepitjarien) `config.json` i l'RPC de Discord.
if (!app.requestSingleInstanceLock()) {
    app.exit(0)
}
app.on('second-instance', () => {
    if (getWindow() != null && !getWindow().isDestroyed()) {
        if (getWindow().isMinimized()) getWindow().restore()
        getWindow().focus()
    }
})

// 3) Acceleració gràfica (abans que l'app estigui llesta).
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
    // Informes d'errors: només les fallades greus (§3 del pla 08).
    if (['crashed', 'oom', 'launch-failed'].includes(details.reason)) {
        reportError('child', `${details.type} process gone: ${details.reason}`, { severe: true, name: 'ChildProcessGone' })
    }
})
app.on('render-process-gone', (_event, _webContents, details) => {
    if (['crashed', 'oom', 'launch-failed'].includes(details.reason)) {
        reportError('child', `renderer process gone: ${details.reason}`, { severe: true, name: 'RenderProcessGone' })
    }
})

// 4) Mòduls de domini (en ordre de dependència: cada un només en depèn dels anteriors).
require('./src-node/main/events')
require('./src-node/main/instances')
const { DiscordWrapper } = require('./src-node/main/presence')
require('./src-node/main/system')
const { getWindow, createWindow, createMenu } = require('./src-node/main/window')
const { configureAutoUpdater } = require('./src-node/main/updater')
require('./src-node/main/auth')
require('./src-node/main/legal')
require('./src-node/main/distro')
require('./src-node/main/skins')
require('./src-node/main/runtime')
const { SocialClient } = require('./src-node/main/social')
const { CatalogSync } = require('./src-node/main/wardrobe')
require('./src-node/main/java')
require('./src-node/main/versions')
const { cleanStaleNatives } = require('./src-node/main/launch')
require('./src-node/main/servers')
require('./src-node/main/mods')
require('./src-node/main/news')

// 5) Cicle de vida.
app.on('will-quit', () => { DiscordWrapper.shutdownRPC(); SocialClient.stop() })

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
app.on('ready', () => ErrorReports.start())
app.on('ready', () => { setTimeout(() => { void CatalogSync.sync() }, 3000) })
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
    if (getWindow() === null) {
        createWindow()
    }
})
