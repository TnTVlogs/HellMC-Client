'use strict'

// 06 §12 pas 2: `window.hellmc`, en paral·lel al `launcherAPI` antic (`app/assets/js/preload-bridge.js`,
// que no es toca). Només el fa servir la finestra de proves del renderer nou
// (`openRendererTestWindow`, `index.js`); l'app antiga (EJS) no carrega aquest fitxer.
//
// De moment és un MOCK: dades estàtiques que compleixen la forma de la interfície de 06 §5, sense
// tocar `HellMC-Core`/Nebula/disc de veritat encara (això és el pas 3, «moure la lògica de
// llançament a servei»). Els controls de finestra (`window.*`) sí que són reals (IPC cap al main),
// perquè calen de seguida per a la barra de títol pròpia (08 §8).

const { contextBridge, ipcRenderer } = require('electron')

/** @type {import('hellmc-distribution-types').Distribution} */
const MOCK_DISTRIBUTION = {
    format: 2,
    minClientVersion: '2.0.0',
    version: 'mock-' + Date.now(),
    servers: [],
    versions: []
}

function makeEmitter() {
    const listeners = new Set()
    return {
        emit: (payload) => listeners.forEach((cb) => cb(payload)),
        subscribe: (cb) => {
            listeners.add(cb)
            return () => listeners.delete(cb)
        }
    }
}

const distroChangeEmitter = makeEmitter()
const launchProgressEmitter = makeEmitter()
const versionsProgressEmitter = makeEmitter()
const maximizeChangeEmitter = makeEmitter()
const updaterEventEmitter = makeEmitter()

ipcRenderer.on('hellmc:window-maximize-changed', (_event, maximized) => {
    maximizeChangeEmitter.emit(maximized)
})

/** @type {import('../renderer/src/api').HellMCApi} */
const hellmcApi = {
    distro: {
        get: () => Promise.resolve(MOCK_DISTRIBUTION),
        refresh: () => Promise.resolve({ distribution: MOCK_DISTRIBUTION, fromCache: true }),
        onChange: (cb) => distroChangeEmitter.subscribe(cb)
    },
    config: {
        get: () => Promise.resolve({
            ui: { theme: 'system', performance: 'auto', uiScale: 100, sidebarCollapsed: false, language: 'en' }
        }),
        set: () => Promise.resolve(),
        getVersion: () => Promise.resolve({}),
        setVersion: () => Promise.resolve()
    },
    auth: {
        accounts: () => Promise.resolve([]),
        select: () => Promise.resolve(),
        addMicrosoft: () => Promise.reject(new Error('not implemented (mock)')),
        addOffline: (username) => Promise.resolve({
            type: 'offline',
            uuid: 'mock-offline-uuid',
            displayName: username
        }),
        remove: () => Promise.resolve(),
        validate: () => Promise.resolve({ status: 'offline' })
    },
    launch: {
        start: () => Promise.resolve(),
        cancel: () => Promise.resolve(),
        onProgress: (cb) => launchProgressEmitter.subscribe(cb)
    },
    versions: {
        status: () => Promise.resolve({ installed: false, sizeBytes: 0, needsUpdate: false }),
        install: () => Promise.resolve(),
        verify: () => Promise.resolve(),
        uninstall: () => Promise.resolve(),
        onProgress: (cb) => versionsProgressEmitter.subscribe(cb)
    },
    java: {
        detect: () => Promise.resolve({ available: false }),
        pick: () => Promise.resolve(null)
    },
    news: {
        get: () => Promise.resolve({ items: [], fromCache: false, fetchedAt: Date.now() })
    },
    status: {
        ping: () => Promise.resolve({ online: false })
    },
    system: {
        memory: () => ipcRenderer.invoke('hellmc:system-memory'),
        openPath: (p) => ipcRenderer.invoke('hellmc:open-path', p),
        openExternal: (url) => ipcRenderer.invoke('hellmc:open-external', url),
        platform: process.platform,
        appVersion: process.env.npm_package_version || '0.0.0-dev'
    },
    window: {
        minimize: () => ipcRenderer.send('hellmc:window-minimize'),
        maximizeToggle: () => ipcRenderer.send('hellmc:window-maximize-toggle'),
        close: () => ipcRenderer.send('hellmc:window-close'),
        onMaximizeChange: (cb) => maximizeChangeEmitter.subscribe(cb),
        setTitleBarOverlay: (effectiveTheme) => ipcRenderer.send('hellmc:set-titlebar-overlay', effectiveTheme)
    },
    updater: {
        check: () => Promise.resolve(),
        install: () => { /* no-op (mock) */ },
        onEvent: (cb) => updaterEventEmitter.subscribe(cb)
    },
    discord: {
        setActivity: () => { /* no-op (mock) */ }
    }
}

contextBridge.exposeInMainWorld('hellmc', hellmcApi)
