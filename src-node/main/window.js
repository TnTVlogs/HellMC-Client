'use strict'
// Finestra principal, menú i botons de la finestra.
// Mòdul del procés principal d'Electron (abans tot era a index.js). Registra els seus handlers IPC en carregar-se.
const { app, Menu, BrowserWindow, path, pathToFileURL, isDev, openExternalSafely, ipcMain, nativeTheme, os } = require('./core')
const { ROOT } = require('./core')



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
            preload: path.join(ROOT, 'src-node', 'preload.js'),
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
        win.loadURL(pathToFileURL(path.join(ROOT, 'renderer-dist', 'index.html')).toString())
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
        const isOwnFile = url.startsWith(pathToFileURL(path.join(ROOT, 'renderer-dist')).toString())
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

    return path.join(ROOT, 'app', 'assets', 'images', `${filename}.${ext}`)
}

/** La finestra principal (o null si encara no existeix / s'ha tancat). */
function getWindow() {
    return win
}


module.exports = {
    createMenu,
    createWindow,
    getPlatformIcon,
    getWindow
}
