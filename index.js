const remoteMain = require('@electron/remote/main')
remoteMain.initialize()

// Requirements
const { app, BrowserWindow, globalShortcut, ipcMain, Menu, shell } = require('electron')
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
function initAutoUpdater(event, data) {

    if (data) {
        autoUpdater.allowPrerelease = true
    } else {
        // Defaults to true if application version contains prerelease components (e.g. 0.12.1-alpha.1)
        // autoUpdater.allowPrerelease = true
    }

    if (isDev) {
        autoUpdater.autoInstallOnAppQuit = false
        autoUpdater.updateConfigPath = path.join(__dirname, 'dev-app-update.yml')
    }
    if (process.platform === 'darwin') {
        autoUpdater.autoDownload = false
    }
    autoUpdater.removeAllListeners()
    autoUpdater.on('update-available', (info) => {
        event.sender.send('autoUpdateNotification', 'update-available', info)
    })
    autoUpdater.on('update-downloaded', (info) => {
        event.sender.send('autoUpdateNotification', 'update-downloaded', info)
    })
    autoUpdater.on('update-not-available', (info) => {
        event.sender.send('autoUpdateNotification', 'update-not-available', info)
    })
    autoUpdater.on('checking-for-update', () => {
        event.sender.send('autoUpdateNotification', 'checking-for-update')
    })
    autoUpdater.on('error', (err) => {
        event.sender.send('autoUpdateNotification', 'realerror', err)
    })
}

// Open channel to listen for update actions.
ipcMain.on('autoUpdateAction', (event, arg, data) => {
    switch (arg) {
        case 'initAutoUpdater':
            console.log('Initializing auto updater.')
            initAutoUpdater(event, data)
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