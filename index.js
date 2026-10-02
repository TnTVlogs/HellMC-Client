const remoteMain = require('@electron/remote/main')
remoteMain.initialize()

// Requirements
const { app, BrowserWindow, dialog, globalShortcut, ipcMain, Menu, shell } = require('electron')
const autoUpdater = require('electron-updater').autoUpdater
const ejse = require('ejs-electron')
const fs = require('fs')
const isDev = require('./app/assets/js/isdev')
const os = require('os')
const path = require('path')
const semver = require('semver')
const { pathToFileURL } = require('url')
const { AZURE_CLIENT_ID, MSFT_OPCODE, MSFT_REPLY_TYPE, MSFT_ERROR, SHELL_OPCODE } = require('./app/assets/js/ipcconstants')
const LangLoader = require('./app/assets/js/langloader')

// Setup Lang
LangLoader.setupLanguage()

// Setup auto updater.
//
// 2.5 (Configuració > Actualitzacions): petició explícita de l'usuari, «com el de Discord» —
// mai cap assistent NSIS visible i l'actualització «es fa sola». Dues peces calien, no només
// codi: `electron-builder.yml` tenia `nsis.oneClick: false` (assistent multi-pas, es veu
// sempre, també en una actualització silenciosa — `isSilent` de `quitAndInstall` només
// suprimeix la UI de l'INSTAL·LADOR, no evita l'assistent si el paquet es va construir amb
// `oneClick:false`); canviat a `oneClick: true`. Amb això, `autoDownload` (ja `true` per
// defecte a win/linux, nomes `false` a `darwin` —Squirrel.Mac no té el mateix suport silenciós)
// + `autoInstallOnAppQuit` (per defecte `true`, només desactivat a `isDev`) ja basten: es
// baixa en segon pla sense preguntar i s'instal·la sola el proper cop que l'app es tanqui del
// tot, sense cap diàleg «Reinicia ara?».
//
// `configureAutoUpdater` és ara idempotent i es crida **dues vegades**: un cop en arrencar
// (`app.on('ready', …)` més avall, 09 §Fase 2.5), perquè la comprovació passi encara que
// l'usuari només obri la finestra de proves del renderer nou i l'app antiga mai arribi a
// enviar `autoUpdateAction:initAutoUpdater`; i un cop més des d'aquest canal (compatibilitat
// amb l'app antiga, que ja l'invocava així per canviar `allowPrerelease` des de Configuració).
// Cap de les dues crides exclou l'altra — totes dues reben els mateixos esdeveniments, reenviats
// a **totes dues finestres** (`win`/`rendererTestWin`, les que existeixin) en comptes del
// `event.sender` original (que podia quedar penjat si la finestra que havia fet la crida
// `initAutoUpdater` es tancava abans que arribés un esdeveniment posterior).
function broadcastUpdaterEvent(updaterEvent) {
    if (rendererTestWin != null && !rendererTestWin.isDestroyed()) {
        rendererTestWin.webContents.send('hellmc:updater-event', updaterEvent)
    }
}
function broadcastLegacyUpdaterNotification(type, data) {
    if (win != null && !win.webContents.isDestroyed()) {
        win.webContents.send('autoUpdateNotification', type, data)
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
    if (process.platform === 'darwin') {
        autoUpdater.autoDownload = false
    }
    autoUpdater.removeAllListeners()
    autoUpdater.on('checking-for-update', () => {
        broadcastLegacyUpdaterNotification('checking-for-update')
        broadcastUpdaterEvent({ type: 'checking-for-update' })
    })
    autoUpdater.on('update-available', (info) => {
        broadcastLegacyUpdaterNotification('update-available', info)
        broadcastUpdaterEvent({ type: 'update-available', info })
    })
    autoUpdater.on('update-not-available', (info) => {
        broadcastLegacyUpdaterNotification('update-not-available', info)
        broadcastUpdaterEvent({ type: 'update-not-available', info })
    })
    autoUpdater.on('download-progress', (progress) => {
        broadcastUpdaterEvent({ type: 'download-progress', info: { percent: progress.percent } })
    })
    autoUpdater.on('update-downloaded', (info) => {
        broadcastLegacyUpdaterNotification('update-downloaded', info)
        broadcastUpdaterEvent({ type: 'update-downloaded', info })
        // Deliberadament NO es demana res aquí: `autoInstallOnAppQuit` ja instal·la en silenci
        // (oneClick, cap assistent) el proper cop que l'app es tanqui del tot.
    })
    autoUpdater.on('error', (err) => {
        broadcastLegacyUpdaterNotification('realerror', err)
        broadcastUpdaterEvent({ type: 'error', info: { message: err?.message ?? String(err) } })
    })
}

// Open channel to listen for update actions.
ipcMain.on('autoUpdateAction', (event, arg, data) => {
    switch (arg) {
        case 'initAutoUpdater':
            console.log('Initializing auto updater.')
            configureAutoUpdater(data)
            event.sender.send('autoUpdateNotification', 'ready')
            break
        case 'checkForUpdate':
            autoUpdater.checkForUpdates()
                .catch(err => {
                    event.sender.send('autoUpdateNotification', 'realerror', err)
                })
            break
        case 'allowPrereleaseChange':
            if (!data) {
                const preRelComp = semver.prerelease(app.getVersion())
                if (preRelComp != null && preRelComp.length > 0) {
                    autoUpdater.allowPrerelease = true
                } else {
                    autoUpdater.allowPrerelease = data
                }
            } else {
                autoUpdater.allowPrerelease = data
            }
            break
        case 'installUpdateNow':
            autoUpdater.quitAndInstall()
            break
        default:
            console.log('Unknown argument', arg)
            break
    }
})

// 2.5 (`window.hellmc.updater`, 06 §5): `check` desencadena la mateixa comprovació silenciosa
// (els resultats arriben per `hellmc:updater-event`, mai com a valor resolt — `checkForUpdates`
// només confirma que la comprovació s'ha iniciat). `install` força la instal·lació ara mateix
// (`isSilent:true` — mai assistent, encara que `oneClick` ja ho garanteix igualment;
// `isForceRunAfter:true` reobre l'app, com Discord) — només té sentit cridar-ho després d'un
// `update-downloaded`; si no hi ha res baixat, `quitAndInstall` no fa res perillós (electron-updater
// ho ignora), no calia guardar estat propi per evitar-ho.
ipcMain.handle('hellmc:updater-check', async () => {
    await autoUpdater.checkForUpdates()
})
ipcMain.handle('hellmc:updater-install', () => {
    autoUpdater.quitAndInstall(true, true)
})
// Redirect distribution index event from preloader to renderer.
let distroIndexDone = false
let distroIndexSuccess = false
ipcMain.on('distributionIndexDone', (event, res) => {
    distroIndexDone = true
    distroIndexSuccess = res
    event.sender.send('distributionIndexDone', res)
})
ipcMain.on('requestDistributionIndexStatus', (event) => {
    if (distroIndexDone) {
        event.sender.send('distributionIndexDone', distroIndexSuccess)
    }
})

// Language-aware reload
const ConfigManager = require('./app/assets/js/configmanager')

// 2.1: serveis reals per `window.hellmc` (finestra de proves del renderer nou) — reutilitzen la
// mateixa lògica que ja fa servir l'app antiga (`preload-bridge.js`), mai reimplementada, només
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
const { DistroAPI } = DistroManager
const ProcessBuilder = require('./app/assets/js/processbuilder')
const DataSharing = require('./app/assets/js/datasharing')
const { FullRepair, DistributionIndexProcessor, MojangIndexProcessor, downloadFile } = require('hellmc-core/dl')
// 2.3 (JDK auto-download): `validateLocalFile` viu a `hellmc-core/common` (no a `hellmc-core/dl`
// amb la resta d'utilitats de descàrrega) — mateix mòdul que ja fa servir `preload-bridge.js`.
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

// Mateixa injecció que `preload-bridge.js:49-50` fa per la UI antiga — `DistroAPI` (singleton de
// `distromanager.js`) necessita `commonDir`/`instanceDir` abans de la primera crida a
// `getDistribution()`, i `distromanager.js` els deixa `null` a propòsit (el preloader antic els
// injecta). Aquí ho fem un cop en arrencar perquè `window.hellmc` no depèn de cap preloader antic.
DistroAPI['commonDir'] = ConfigManager.getCommonDirectory()
DistroAPI['instanceDir'] = ConfigManager.getInstanceDirectory()

ipcMain.on('reload-renderer', (event) => {
    if (isGameRunning) {
        console.warn('Skipping renderer reload because a game is currently running.')
        return
    }
    console.log('Refreshing language and reloading renderer.')
    ConfigManager.load()
    LangLoader.setupLanguage()
    updateEJSData()
    win.reload()
})

// Track game status (used to guard renderer reloads and broadcast UI state).
let isGameRunning = false
ipcMain.on('request-game-status', (event) => {
    event.reply('game-status-response', isGameRunning)
})
ipcMain.on('game-status-changed', (event, running) => {
    isGameRunning = running
    if (win) {
        win.webContents.send('game-status-changed', isGameRunning)
    }
})

// Handle trash item.
ipcMain.handle(SHELL_OPCODE.TRASH_ITEM, async (event, ...args) => {
    try {
        await shell.trashItem(args[0])
        return {
            result: true
        }
    } catch (error) {
        return {
            result: false,
            error: error
        }
    }
})

// Disable hardware acceleration.
// https://electronjs.org/docs/tutorial/offscreen-rendering
app.disableHardwareAcceleration()


const REDIRECT_URI = 'https://login.microsoftonline.com/common/oauth2/nativeclient'

// Microsoft Auth Login
let msftAuthWindow
let msftAuthSuccess
let msftAuthViewSuccess
let msftAuthViewOnClose
ipcMain.on(MSFT_OPCODE.OPEN_LOGIN, (ipcEvent, ...arguments_) => {
    if (msftAuthWindow) {
        ipcEvent.reply(MSFT_OPCODE.REPLY_LOGIN, MSFT_REPLY_TYPE.ERROR, MSFT_ERROR.ALREADY_OPEN, msftAuthViewOnClose)
        return
    }
    msftAuthSuccess = false
    msftAuthViewSuccess = arguments_[0]
    msftAuthViewOnClose = arguments_[1]
    msftAuthWindow = new BrowserWindow({
        title: LangLoader.queryJS('index.microsoftLoginTitle'),
        backgroundColor: '#222222',
        width: 520,
        height: 600,
        frame: true,
        icon: getPlatformIcon('SealCircle')
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
    msftAuthWindow.loadURL(`https://login.microsoftonline.com/consumers/oauth2/v2.0/authorize?prompt=select_account&client_id=${AZURE_CLIENT_ID}&response_type=code&scope=XboxLive.signin%20offline_access&redirect_uri=${REDIRECT_URI}`)
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
        title: LangLoader.queryJS('index.microsoftLogoutTitle'),
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

function updateEJSData() {
    console.log('Updating EJS data..')
    const data = {
        bkid: Math.floor((Math.random() * fs.readdirSync(path.join(__dirname, 'app', 'assets', 'images', 'backgrounds')).length)),
        lang: (str, placeHolders) => LangLoader.queryEJS(str, placeHolders)
    }
    Object.entries(data).forEach(([key, val]) => ejse.data(key, val))
}

function createWindow() {

    win = new BrowserWindow({
        width: 980,
        height: 552,
        minWidth: 980,
        minHeight: 552,
        icon: getPlatformIcon('SealCircle'),
        frame: false,
        webPreferences: {
            preload: path.join(__dirname, 'app', 'assets', 'js', 'preload-bridge.js'),
            nodeIntegration: false,
            contextIsolation: true,
            sandbox: false
        },
        backgroundColor: '#171614'
    })
    remoteMain.enable(win.webContents)

    updateEJSData()

    win.loadURL(pathToFileURL(path.join(__dirname, 'app', 'app.ejs')).toString())

    /*win.once('ready-to-show', () => {
        win.show()
    })*/

    if (isDev) {
        win.webContents.openDevTools()
    }

    win.removeMenu()

    win.resizable = true


    win.on('closed', () => {
        win = null
    })
}

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

// 06 §12 pas 1: finestra de proves per al renderer nou (Vite+Preact), separada de `createWindow()`
// perquè l'app antiga (EJS/jQuery) segueixi funcionant intacta mentre es migra pas a pas. Només
// en dev, darrere una drecera perquè no interfereixi amb l'ús normal. Amb `RENDERER_DEV_SERVER=1`
// carrega el servidor de `vite` (`npm run dev:renderer`) en lloc del build estàtic.
let rendererTestWin = null
function openRendererTestWindow() {
    if (rendererTestWin != null) {
        rendererTestWin.focus()
        return
    }

    // 08 §8: botons de finestra natius via `titleBarOverlay` (Windows/Linux) o `trafficLightPosition`
    // (macOS) en comptes de simular-los amb CSS (l'error de la barra estirada a macOS de l'app
    // antiga venia exactament d'intentar-ho amb CSS, 08 §8.1).
    const platformTitleBarOptions = process.platform === 'darwin'
        ? { titleBarStyle: 'hidden', trafficLightPosition: { x: 16, y: 14 } }
        : { titleBarStyle: 'hidden', titleBarOverlay: { color: '#15181D', symbolColor: '#ECEFF4', height: 36 } }

    rendererTestWin = new BrowserWindow({
        width: 1280,
        height: 760,
        minWidth: 800,
        minHeight: 560,
        title: 'HellMC Client — renderer (proves)',
        ...platformTitleBarOptions,
        webPreferences: {
            preload: path.join(__dirname, 'src-node', 'preload.js'),
            nodeIntegration: false,
            contextIsolation: true,
            sandbox: false
        },
        backgroundColor: '#0E1013'
    })

    if (process.env.RENDERER_DEV_SERVER === '1') {
        const devUrl = 'http://localhost:5173'
        const loadDevServer = () => {
            rendererTestWin?.loadURL(devUrl).catch(() => { /* handled by did-fail-load below */ })
        }
        // El servidor de `vite` pot no estar a punt encara (dues comandes arrencant en paral·lel,
        // `npm run dev`); si falla la primera càrrega, es reintenta en lloc de quedar-se en blanc.
        rendererTestWin.webContents.on('did-fail-load', () => {
            if (rendererTestWin != null) {
                setTimeout(loadDevServer, 500)
            }
        })
        loadDevServer()
    } else {
        rendererTestWin.loadURL(pathToFileURL(path.join(__dirname, 'renderer-dist', 'index.html')).toString())
    }

    rendererTestWin.webContents.openDevTools()

    // 2.4 (notícies completes): primer cop que HTML extern de veritat (article RSS sanititzat) es
    // renderitza dins la finestra — un clic a un enllaç del contingut (o Ctrl+clic/mig-clic obrint
    // finestra nova) no ha de navegar-hi mai dins d'aquesta finestra ni obrir-ne una altra
    // d'Electron sense CSP/preload. El lector ja intercepta els clics i crida `system.openExternal`
    // (renderer), això és només la xarxa de seguretat perquè cap altre camí (arrossegar un enllaç,
    // un `<a>` sense el listener per algun motiu) mai deixi la finestra fora de `renderer-dist`/
    // `localhost:5173`.
    rendererTestWin.webContents.on('will-navigate', (event, url) => {
        const isDevServer = process.env.RENDERER_DEV_SERVER === '1' && url.startsWith('http://localhost:5173')
        const isOwnFile = url.startsWith(pathToFileURL(path.join(__dirname, 'renderer-dist')).toString())
        if (isDevServer || isOwnFile) return
        event.preventDefault()
        shell.openExternal(url)
    })
    rendererTestWin.webContents.setWindowOpenHandler(({ url }) => {
        shell.openExternal(url)
        return { action: 'deny' }
    })

    rendererTestWin.on('maximize', () => {
        rendererTestWin.webContents.send('hellmc:window-maximize-changed', true)
    })
    rendererTestWin.on('unmaximize', () => {
        rendererTestWin.webContents.send('hellmc:window-maximize-changed', false)
    })

    rendererTestWin.on('closed', () => {
        rendererTestWin = null
    })
}

// IPC de `src-node/preload.js` (`window.hellmc`), només fet servir per la finestra de proves. Es
// resol la finestra a partir del `sender` (no de `rendererTestWin`) perquè, si en el futur hi ha
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
ipcMain.handle('hellmc:system-memory', () => {
    return { totalMb: Math.round(os.totalmem() / 1048576), freeMb: Math.round(os.freemem() / 1048576) }
})
ipcMain.handle('hellmc:open-path', (_event, p) => shell.openPath(p))
ipcMain.handle('hellmc:open-external', (_event, url) => shell.openExternal(url))
// 2.5 (Sobre > «Llicències de tercers», D23): `THIRD_PARTY_LICENSES.txt` viu a l'arrel del repo en
// dev i a `extraResources` (`electron-builder.yml`) en un paquet real — mai dins l'asar.
ipcMain.handle('hellmc:open-third-party-licenses', () => {
    const file = isDev
        ? path.join(__dirname, 'THIRD_PARTY_LICENSES.txt')
        : path.join(process.resourcesPath, 'THIRD_PARTY_LICENSES.txt')
    return shell.openPath(file)
})
// `process.env.npm_package_version` (l'antic valor del mock a `preload.js`) només existeix quan
// el procés principal s'ha arrencat via `npm run …` — en un paquet real (producció) mai hi és,
// Sobre mostraria sempre «0.0.0-dev». Síncron (`event.returnValue`) perquè `api.ts` declara
// `system.appVersion` com a valor pla, no una promesa — es demana un sol cop en carregar el
// preload, igual que `process.platform`.
ipcMain.on('hellmc:system-app-version', (event) => {
    event.returnValue = app.getVersion()
})

// 2.5 (`window.hellmc.config.get/set`, 06 §6 store `ui`): abans mock (tema/idioma es perdien a
// cada reinici, `src-node/preload.js`) — ara persisteix de veritat a `config.json`.
ipcMain.handle('hellmc:config-get', () => ({ ui: ConfigManager.getUiConfig() }))
ipcMain.handle('hellmc:config-set', (_event, patch) => {
    if (patch.ui != null) ConfigManager.setUiConfig(patch.ui)
    ConfigManager.save()
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
    dataDirectory: ConfigManager.getDataDirectory()
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
    ConfigManager.setDataDirectory(result.filePaths[0])
    ConfigManager.save()
    return result.filePaths[0]
})

// ── 2.1: distribució (real, `DistroAPI` compartit amb l'app antiga) ──────────────────────────
ipcMain.handle('hellmc:distro-get', async () => {
    const distro = await DistroAPI.getDistribution()
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
    ConfigManager.setSelectedVersion(versionId)
    ConfigManager.save()
})
ipcMain.handle('hellmc:selection-set-server', (_event, serverId) => {
    ConfigManager.setSelectedServer(serverId)
    ConfigManager.save()
})
ipcMain.handle('hellmc:selection-get-last-version-for-server', (_event, serverId) => {
    return ConfigManager.getLastVersionByServer(serverId)
})
ipcMain.handle('hellmc:selection-set-last-version-for-server', (_event, serverId, versionId) => {
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
    const account = await AuthManager.addMojangAccount(username)
    return normalizeAccount(account)
})
// 2.5 (Compte > Microsoft, últim tros pendent des de 2.1 §6): el preload nou obre la mateixa
// finestra d'OAuth que l'app antiga (`MSFT_OPCODE.OPEN_LOGIN`/`REPLY_LOGIN`, dalt — mai tocada,
// cap canal nou al main) i, un cop té el `code`, només calia aquest handler per acabar
// l'intercanvi — `AuthManager.addMicrosoftAccount` és exactament la mateixa funció que crida
// `preload-bridge.js:306` per a la UI vella.
ipcMain.handle('hellmc:auth-add-microsoft', async (_event, code) => {
    const account = await AuthManager.addMicrosoftAccount(code)
    return normalizeAccount(account)
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
        const ok = await AuthManager.validateSelected()
        return { status: ok ? 'ok' : 'expired' }
    } catch {
        return { status: 'invalid' }
    }
})

// ── 2.1/2.11: llançament real (repair/descàrrega/procés), multi-instància de veritat ──────────
// Reutilitza exactament la mateixa seqüència que `preload-bridge.js` (`game.createRepair` +
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
// decidit amb l'usuari). `isGameRunning`/`game-status-changed` (usats per l'app antiga per no
// recarregar mentre juga, línies ~150-175) es deriven de `runningInstances.size > 0` — cap canvi de
// comportament per l'app antiga, que no sap ni li cal saber que ara pot haver-n'hi més d'una.
const runningInstances = new Map() // key -> { id, versionId, serverId, startedAt, proc }
const launchingTargets = new Map() // key -> { repair: FullRepair | null }

function targetKey(versionId, serverId) {
    return `${versionId}::${serverId ?? ''}`
}
function instancesSnapshot() {
    return [...runningInstances.values()].map(({ id, versionId, serverId, startedAt }) => ({ id, versionId, serverId, startedAt }))
}
function broadcastInstances() {
    if (rendererTestWin != null && !rendererTestWin.isDestroyed()) {
        rendererTestWin.webContents.send('hellmc:instances-changed', instancesSnapshot())
    }
}
function syncIsGameRunning() {
    isGameRunning = runningInstances.size > 0
    if (win) win.webContents.send('game-status-changed', isGameRunning)
}

ipcMain.handle('hellmc:launch-start', async (event, target) => {
    const sender = event.sender
    const send = (progress) => { if (!sender.isDestroyed()) sender.send('hellmc:launch-progress', progress) }
    const key = targetKey(target.versionId, target.serverId)

    if (runningInstances.has(key) || launchingTargets.has(key)) {
        send({ phase: 'error', percent: 0, error: { code: 'ALREADY_RUNNING', message: 'This version is already running or launching.' } })
        return
    }

    const account = ConfigManager.getSelectedAccount()
    if (account == null) {
        send({ phase: 'error', percent: 0, error: { code: 'NO_ACCOUNT', message: 'No account selected.' } })
        return
    }

    const launchState = { repair: null }
    launchingTargets.set(key, launchState)
    try {
        send({ phase: 'refreshing-distribution', percent: 0 })
        const distro = await DistroAPI.refreshDistributionOrFallback()
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
        await AuthManager.validateSelected()

        ConfigManager.ensureJavaConfig(selectedVersion.rawVersion.id, selectedVersion.effectiveJavaOptions, selectedVersion.rawVersion.javaOptions?.ram)
        const storedJavaExecutable = ConfigManager.getJavaExecutable(selectedVersion.rawVersion.id)
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

        send({ phase: 'verifying-files', percent: 0 })
        const repair = new FullRepair(
            ConfigManager.getCommonDirectory(),
            ConfigManager.getInstanceDirectory(),
            ConfigManager.getLauncherDirectory(),
            selectedVersion.rawVersion.id,
            DistroAPI.isDevMode()
        )
        launchState.repair = repair
        repair.spawnReceiver()
        await repair.verifyFiles((percent) => send({ phase: 'verifying-files', percent }))

        send({ phase: 'downloading', percent: 0 })
        await repair.download((percent) => send({ phase: 'downloading', percent }))
        repair.destroyReceiver()
        launchState.repair = null

        send({ phase: 'launching', percent: 100 })
        const mojangProcessor = new MojangIndexProcessor(ConfigManager.getCommonDirectory(), selectedVersion.rawVersion.minecraftVersion)
        const distroProcessor = new DistributionIndexProcessor(ConfigManager.getCommonDirectory(), distro, selectedVersion.rawVersion.id)
        const modLoaderData = await distroProcessor.loadModLoaderVersionJson(selectedVersion)
        const versionData = await mojangProcessor.getVersionJson()

        // D26 (06 §8.2): mateix punt on l'app antiga sincronitza `mods/` — `ProcessBuilder.build()`
        // (§93 avall) fa `fs.ensureDirSync(gameDir)` ell mateix, però cal `gameDir` ja creat *abans*
        // per poder-hi enllaçar els elements compartits, per això es garanteix aquí també (idempotent).
        const gameDir = getVersionInstanceDir(selectedVersion.rawVersion.id)
        fs.mkdirSync(gameDir, { recursive: true })
        await DataSharing.applyDataSharing(gameDir, selectedVersion.rawVersion, selectedVersion.rawVersion.id)

        const pb = new ProcessBuilder(selectedVersion, versionData, modLoaderData, account, app.getVersion(), server)
        const proc = pb.build()
        runningInstances.set(key, { id: key, versionId: target.versionId, serverId: target.serverId, startedAt: Date.now(), proc })
        syncIsGameRunning()
        broadcastInstances()

        const onProcEnd = () => {
            runningInstances.delete(key)
            syncIsGameRunning()
            broadcastInstances()
            send({ phase: 'closed', percent: 100 })
        }
        proc.on('close', onProcEnd)
        proc.on('exit', onProcEnd)
        // `spawn` amb un executable inexistent/inaccessible falla de forma ASÍNCRONA (l'esdeveniment
        // 'error' del child, no una excepció síncrona) — sense escoltar-lo, l'error no passava mai
        // pel `catch` d'aquí baix i sortia com a excepció no capturada del procés principal (diàleg
        // natiu «A JavaScript error occurred», reportat per l'usuari amb un `ENOENT` de Java).
        proc.on('error', (spawnErr) => {
            devLog(`spawn error: ${spawnErr.message}`)
            runningInstances.delete(key)
            syncIsGameRunning()
            broadcastInstances()
            send({ phase: 'error', percent: 0, error: { code: 'SPAWN_FAILED', message: spawnErr.message } })
        })

        send({ phase: 'ready', percent: 100 })
    } catch (err) {
        devLog(`launch-start failed: ${err?.stack || err}`)
        if (launchState.repair) {
            launchState.repair.destroyReceiver()
            launchState.repair = null
        }
        send({ phase: 'error', percent: 0, error: { code: 'LAUNCH_FAILED', message: err?.message || String(err) } })
    } finally {
        launchingTargets.delete(key)
    }
})

ipcMain.handle('hellmc:launch-cancel', (_event, target) => {
    const key = targetKey(target.versionId, target.serverId)
    const state = launchingTargets.get(key)
    if (state?.repair) {
        state.repair.destroyReceiver()
    }
    launchingTargets.delete(key)
})

// ── 2.11: instàncies en execució (llistar + tancar per la força) ─────────────────────────────
ipcMain.handle('hellmc:instances-list', () => instancesSnapshot())
ipcMain.handle('hellmc:instances-kill', (_event, id) => {
    const instance = runningInstances.get(id)
    if (instance) instance.proc.kill()
})

// ── 2.2: ping de servidors (real, socket directe) ─────────────────────────────────────────────
ipcMain.handle('hellmc:status-ping', async (_event, address) => {
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

ipcMain.handle('hellmc:versions-status', async (_event, versionId) => {
    const gameDir = getVersionInstanceDir(versionId)
    if (!fs.existsSync(gameDir)) {
        // Ruta retornada igualment (07 §4.2 pt.4, pestanya Fitxers): és on s'instal·larà, útil
        // encara que «Obrir carpeta» no tingui gaire sentit fins que existeixi de veritat.
        return { installed: false, sizeBytes: 0, needsUpdate: false, path: gameDir }
    }
    const sizeBytes = await getDirectorySize(gameDir)
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
        DistroAPI.isDevMode()
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

ipcMain.handle('hellmc:versions-install', async (event, versionId) => {
    await performRepair(versionId, makeVersionsProgressSender(event, versionId))
})
ipcMain.handle('hellmc:versions-verify', async (event, versionId) => {
    await performRepair(versionId, makeVersionsProgressSender(event, versionId))
})
ipcMain.handle('hellmc:versions-uninstall', async (_event, versionId) => {
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
})

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
    await ensureJavaConfigForVersion(versionId)
    return {
        minRAM: ConfigManager.getMinRAM(versionId),
        maxRAM: ConfigManager.getMaxRAM(versionId),
        executable: ConfigManager.getJavaExecutable(versionId),
        jvmOptions: ConfigManager.getJVMOptions(versionId)
    }
})
ipcMain.handle('hellmc:config-set-version', async (_event, versionId, patch) => {
    await ensureJavaConfigForVersion(versionId)
    devLog(`config-set-version ${versionId} patch=${JSON.stringify(patch)}`)
    if (patch.minRAM != null) ConfigManager.setMinRAM(versionId, patch.minRAM)
    if (patch.maxRAM != null) ConfigManager.setMaxRAM(versionId, patch.maxRAM)
    if (patch.executable != null) ConfigManager.setJavaExecutable(versionId, patch.executable)
    if (patch.jvmOptions != null) ConfigManager.setJVMOptions(versionId, patch.jvmOptions)
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
    const found = await discoverBestJvmInstallation(ConfigManager.getDataDirectory(), semverRange)
    devLog(`discoverBestJvmInstallation -> ${JSON.stringify(found)}`)
    if (found == null) return { available: false }
    // `found.path` és l'arrel de la instal·lació JDK, no l'executable — mateixa conversió que
    // `landing.js:292` (`JavaUtils.javaExecFromRoot(jvmDetails.path)`) abans de desar-lo.
    const executable = javaExecFromRoot(found.path)
    ConfigManager.setJavaExecutable(versionId, executable)
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
    return details.map((d) => ({ path: d.path, version: d.semverStr, vendor: d.vendor }))
})
ipcMain.handle('hellmc:java-global-get', () => ConfigManager.getGlobalJavaExecutable())
ipcMain.handle('hellmc:java-global-set', (_event, executable) => {
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
ipcMain.handle('hellmc:java-download', async (event, versionId) => {
    const selectedVersion = await ensureJavaConfigForVersion(versionId)
    if (selectedVersion == null) {
        throw new Error(`Version ${versionId} not found in distribution.`)
    }
    const { suggestedMajor, supported: semverRange, distribution: jdkDistribution } = selectedVersion.effectiveJavaOptions
    const sender = event.sender
    const send = (phase, percent) => {
        if (!sender.isDestroyed()) sender.send('hellmc:java-download-progress', versionId, { phase, percent })
    }
    devLog(`java-download ${versionId} suggestedMajor=${suggestedMajor} distribution=${jdkDistribution}`)

    send('fetching-jdk', 0)
    const asset = await latestOpenJDK(suggestedMajor, ConfigManager.getDataDirectory(), jdkDistribution)
    if (asset == null) {
        throw new Error('JDK_FETCH_FAILED')
    }

    send('downloading-java', 0)
    await downloadFile(asset.url, asset.path, (progress) => {
        send('downloading-java', Math.trunc((progress.percent ?? 0) * 100))
    })
    send('downloading-java', 100)

    // `hash` és opcional als `Asset` no rastrejats (`dl/Asset.d.ts`) — aquí sempre hi és (ve
    // d'Adoptium/Corretto), però es comprova igualment per no assumir-ho a cegues.
    if (asset.hash != null && !(await validateLocalFile(asset.path, asset.algo, asset.hash))) {
        devLog(`java-download corrupted: ${asset.path}`)
        throw new Error('JAVA_DOWNLOAD_CORRUPTED')
    }

    send('extracting-java', 0)
    const newJavaExec = await extractJdk(asset.path)
    devLog(`java-download extracted -> ${newJavaExec}`)

    ConfigManager.setJavaExecutable(versionId, newJavaExec)
    ConfigManager.save()

    const info = await validateSelectedJvm(newJavaExec, semverRange)
    send('ready', 100)
    return { available: true, path: newJavaExec, version: info?.semverStr }
})

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

function normalizeFeedItem(item, feedUrl) {
    const dateStr = item.isoDate ?? item.pubDate
    const date = dateStr != null ? Date.parse(dateStr) : Number.NaN
    return {
        id: item.guid ?? item.link ?? `${feedUrl}#${item.title ?? date}`,
        title: item.title ?? '',
        date: Number.isNaN(date) ? Date.now() : date,
        url: item.link ?? feedUrl,
        summary: item.contentSnippet ?? item.summary,
        // 2.4 completes (07 §5): calien per a l'autor i el lector dins l'app — `news-get` (2.1/2.2)
        // mai els havia necessitat (només la targeta Jugar/detall de servidor, cap lectura completa).
        author: item.creator ?? item.author,
        content: item.content ?? item.contentSnippet ?? item.summary ?? ''
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
    const results = await Promise.allSettled(activeFeedUrls.map((url) => rssParser.parseURL(url)))
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
    const fetchedAt = Date.now()
    writeNewsCacheEntry(scopeKey, { items, fetchedAt })
    return { items, fromCache: false, fetchedAt }
}

ipcMain.handle('hellmc:news-get', async (_event, scope) => {
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

// `npm run dev` (OPEN_RENDERER_TEST=1) és per iterar només sobre el renderer nou: no calen
// l'app antiga ni el seu menú, i esperarien recursos/temps d'arrencada per res. `npm start` (sense
// la variable) manté el comportament de sempre.
if (process.env.OPEN_RENDERER_TEST !== '1') {
    app.on('ready', createWindow)
    app.on('ready', createMenu)
}

// 2.5: comprovació silenciosa a l'arrencada, independent que l'app antiga arribi a enviar
// `autoUpdateAction:initAutoUpdater` (p. ex. si només s'obre la finestra de proves del renderer
// nou amb `OPEN_RENDERER_TEST=1`) — Discord-style, mai depèn que l'usuari premi «Comprova ara».
// Repetit cada hora (no en `isDev`, per no martellejar `dev-app-update.yml`/xarxa mentre es
// desenvolupa) — sense cap temporitzador més curt, coherent amb 06 §10 «cap polling innecessari»
// a la resta de la Fase 2.
app.on('ready', () => {
    configureAutoUpdater()
    autoUpdater.checkForUpdates().catch(() => { /* ja reportat via l'esdeveniment 'error' */ })
    if (!isDev) {
        setInterval(() => {
            autoUpdater.checkForUpdates().catch(() => { /* ja reportat via l'esdeveniment 'error' */ })
        }, 60 * 60 * 1000)
    }
})

if (isDev) {
    app.on('ready', () => {
        const registered = globalShortcut.register('CommandOrControl+Shift+R', openRendererTestWindow)
        console.log(registered
            ? '[renderer-test] Drecera Ctrl/Cmd+Shift+R registrada (obre la finestra de proves del renderer nou).'
            : '[renderer-test] AVÍS: no s\'ha pogut registrar Ctrl/Cmd+Shift+R (una altra app deu tenir-la agafada). Fes servir OPEN_RENDERER_TEST=1 en comptes de la drecera.')

        // Amb `OPEN_RENDERER_TEST=1` s'obre sola en arrencar, sense dependre de la drecera (que és
        // global i pot xocar amb una altra app). Fet servir per `npm run dev`.
        if (process.env.OPEN_RENDERER_TEST === '1') {
            openRendererTestWindow()
        }
    })
    app.on('will-quit', () => {
        globalShortcut.unregisterAll()
    })
}

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