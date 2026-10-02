'use strict'

// 06 §12 pas 2: `window.hellmc`, en paral·lel al `launcherAPI` antic (`app/assets/js/preload-bridge.js`,
// que no es toca). Només el fa servir la finestra de proves del renderer nou
// (`openRendererTestWindow`, `index.js`); l'app antiga (EJS) no carrega aquest fitxer.
//
// 2.1-2.4: `distro`/`selection`/`auth`/`launch`/`status`/`versions`/`java`/`config.get|setVersion`/
// `news` ja són reals (IPC cap a `index.js`, que reutilitza la mateixa lògica que
// `preload-bridge.js` quan n'hi ha — veure `11-progres-fase2.md` §6/§7/§8/§9). Encara mock:
// `config.get|set` (tema/idioma, 2.5), `updater`/`discord`. Els controls de finestra (`window.*`)
// ja eren reals des del pas 2 (calien de seguida per la barra de títol pròpia, 08 §8).

const { contextBridge, ipcRenderer } = require('electron')
// 2.5: mateixos opcodes que l'app antiga per a la finestra d'OAuth de Microsoft
// (`index.js` `MSFT_OPCODE.OPEN_LOGIN`/`REPLY_LOGIN`, mai tocada) — reutilitzats tal qual, no
// duplicats, perquè el main process ja sap parlar aquest protocol.
const { MSFT_OPCODE, MSFT_REPLY_TYPE, MSFT_ERROR } = require('../app/assets/js/ipcconstants')

function makeEmitter() {
    const listeners = new Set()
    return {
        emit: (...args) => listeners.forEach((cb) => cb(...args)),
        subscribe: (cb) => {
            listeners.add(cb)
            return () => listeners.delete(cb)
        }
    }
}

const distroChangeEmitter = makeEmitter()
const launchProgressEmitter = makeEmitter()
const versionsProgressEmitter = makeEmitter()
const javaDownloadProgressEmitter = makeEmitter()
const maximizeChangeEmitter = makeEmitter()
const updaterEventEmitter = makeEmitter()
const instancesChangeEmitter = makeEmitter()

ipcRenderer.on('hellmc:window-maximize-changed', (_event, maximized) => {
    maximizeChangeEmitter.emit(maximized)
})
ipcRenderer.on('hellmc:launch-progress', (_event, progress) => {
    launchProgressEmitter.emit(progress)
})
ipcRenderer.on('hellmc:versions-progress', (_event, versionId, progress) => {
    versionsProgressEmitter.emit(versionId, progress)
})
ipcRenderer.on('hellmc:java-download-progress', (_event, versionId, progress) => {
    javaDownloadProgressEmitter.emit(versionId, progress)
})
ipcRenderer.on('hellmc:instances-changed', (_event, instances) => {
    instancesChangeEmitter.emit(instances)
})
ipcRenderer.on('hellmc:updater-event', (_event, updaterEvent) => {
    updaterEventEmitter.emit(updaterEvent)
})

/** @type {import('../renderer/src/api').HellMCApi} */
const hellmcApi = {
    distro: {
        get: () => ipcRenderer.invoke('hellmc:distro-get'),
        refresh: () => ipcRenderer.invoke('hellmc:distro-refresh'),
        onChange: (cb) => distroChangeEmitter.subscribe(cb)
    },
    selection: {
        get: () => ipcRenderer.invoke('hellmc:selection-get'),
        setVersion: (versionId) => ipcRenderer.invoke('hellmc:selection-set-version', versionId),
        setServer: (serverId) => ipcRenderer.invoke('hellmc:selection-set-server', serverId),
        getLastVersionForServer: (serverId) => ipcRenderer.invoke('hellmc:selection-get-last-version-for-server', serverId),
        setLastVersionForServer: (serverId, versionId) => ipcRenderer.invoke('hellmc:selection-set-last-version-for-server', serverId, versionId)
    },
    config: {
        // 2.5: `get`/`set` (tema/idioma/rendiment/mida/devMode, store `ui`) ja persisteixen de
        // veritat a `config.json` (abans mock, es perdien a cada reinici).
        get: () => ipcRenderer.invoke('hellmc:config-get'),
        set: (patch) => ipcRenderer.invoke('hellmc:config-set', patch),
        getVersion: (versionId) => ipcRenderer.invoke('hellmc:config-get-version', versionId),
        setVersion: (versionId, patch) => ipcRenderer.invoke('hellmc:config-set-version', versionId, patch)
    },
    game: {
        get: () => ipcRenderer.invoke('hellmc:game-settings-get'),
        set: (patch) => ipcRenderer.invoke('hellmc:game-settings-set', patch),
        pickDataDirectory: () => ipcRenderer.invoke('hellmc:game-data-directory-pick')
    },
    auth: {
        accounts: () => ipcRenderer.invoke('hellmc:auth-accounts'),
        select: (uuid) => ipcRenderer.invoke('hellmc:auth-select', uuid),
        // 2.5: finestra d'OAuth real (mateix protocol `MSFT_OPCODE` que l'app antiga, `index.js`
        // mai tocat per això) — `.once` perquè una resposta d'una finestra ja tancada no
        // resolgui una crida posterior per error (cada `addMicrosoft()` obre la seva pròpia
        // escolta, consistent amb que el main només permet una finestra d'OAuth oberta alhora).
        addMicrosoft: () => new Promise((resolve, reject) => {
            ipcRenderer.once(MSFT_OPCODE.REPLY_LOGIN, (_event, type, data) => {
                if (type === MSFT_REPLY_TYPE.ERROR) {
                    reject(new Error(data === MSFT_ERROR.NOT_FINISHED ? 'cancelled' : 'microsoft-login-failed'))
                    return
                }
                if (Object.prototype.hasOwnProperty.call(data, 'error')) {
                    reject(new Error(data.error_description || data.error))
                    return
                }
                ipcRenderer.invoke('hellmc:auth-add-microsoft', data.code).then(resolve, reject)
            })
            ipcRenderer.send(MSFT_OPCODE.OPEN_LOGIN, null, null)
        }),
        addOffline: (username) => ipcRenderer.invoke('hellmc:auth-add-offline', username),
        remove: (uuid) => ipcRenderer.invoke('hellmc:auth-remove', uuid),
        validate: () => ipcRenderer.invoke('hellmc:auth-validate')
    },
    launch: {
        start: (target) => ipcRenderer.invoke('hellmc:launch-start', target),
        cancel: (target) => ipcRenderer.invoke('hellmc:launch-cancel', target),
        onProgress: (cb) => launchProgressEmitter.subscribe(cb)
    },
    instances: {
        list: () => ipcRenderer.invoke('hellmc:instances-list'),
        kill: (id) => ipcRenderer.invoke('hellmc:instances-kill', id),
        onChange: (cb) => instancesChangeEmitter.subscribe(cb)
    },
    versions: {
        status: (versionId) => ipcRenderer.invoke('hellmc:versions-status', versionId),
        install: (versionId) => ipcRenderer.invoke('hellmc:versions-install', versionId),
        verify: (versionId) => ipcRenderer.invoke('hellmc:versions-verify', versionId),
        uninstall: (versionId) => ipcRenderer.invoke('hellmc:versions-uninstall', versionId),
        onProgress: (cb) => versionsProgressEmitter.subscribe(cb)
    },
    java: {
        detect: (versionId) => ipcRenderer.invoke('hellmc:java-detect', versionId),
        pick: () => ipcRenderer.invoke('hellmc:java-pick'),
        download: (versionId) => ipcRenderer.invoke('hellmc:java-download', versionId),
        onDownloadProgress: (cb) => javaDownloadProgressEmitter.subscribe(cb),
        listInstallations: () => ipcRenderer.invoke('hellmc:java-list-installations'),
        getGlobalExecutable: () => ipcRenderer.invoke('hellmc:java-global-get'),
        setGlobalExecutable: (executable) => ipcRenderer.invoke('hellmc:java-global-set', executable)
    },
    dataSharing: {
        getPreference: (versionId) => ipcRenderer.invoke('hellmc:datasharing-get-preference', versionId),
        setPreference: (versionId, shared) => ipcRenderer.invoke('hellmc:datasharing-set-preference', versionId, shared),
        getRoot: () => ipcRenderer.invoke('hellmc:datasharing-get-root'),
        setRoot: (mode) => ipcRenderer.invoke('hellmc:datasharing-set-root', mode)
    },
    mods: {
        list: (versionId) => ipcRenderer.invoke('hellmc:mods-list', versionId),
        getState: (versionId) => ipcRenderer.invoke('hellmc:mods-get-state', versionId),
        setState: (versionId, patch) => ipcRenderer.invoke('hellmc:mods-set-state', versionId, patch)
    },
    news: {
        get: (scope) => ipcRenderer.invoke('hellmc:news-get', scope),
        getArchive: () => ipcRenderer.invoke('hellmc:news-archive'),
        markRead: () => ipcRenderer.invoke('hellmc:news-mark-read')
    },
    status: {
        ping: (address) => ipcRenderer.invoke('hellmc:status-ping', address)
    },
    system: {
        memory: () => ipcRenderer.invoke('hellmc:system-memory'),
        openPath: (p) => ipcRenderer.invoke('hellmc:open-path', p),
        openExternal: (url) => ipcRenderer.invoke('hellmc:open-external', url),
        openThirdPartyLicenses: () => ipcRenderer.invoke('hellmc:open-third-party-licenses'),
        platform: process.platform,
        // Síncron (`sendSync`, demanat un sol cop en carregar el preload) perquè sigui correcte
        // també en un paquet empaquetat — `process.env.npm_package_version` (valor antic) només
        // existia quan el procés principal s'havia arrencat via `npm run …`.
        appVersion: ipcRenderer.sendSync('hellmc:system-app-version')
    },
    window: {
        minimize: () => ipcRenderer.send('hellmc:window-minimize'),
        maximizeToggle: () => ipcRenderer.send('hellmc:window-maximize-toggle'),
        close: () => ipcRenderer.send('hellmc:window-close'),
        onMaximizeChange: (cb) => maximizeChangeEmitter.subscribe(cb),
        setTitleBarOverlay: (effectiveTheme) => ipcRenderer.send('hellmc:set-titlebar-overlay', effectiveTheme)
    },
    updater: {
        check: () => ipcRenderer.invoke('hellmc:updater-check'),
        install: () => ipcRenderer.invoke('hellmc:updater-install'),
        onEvent: (cb) => updaterEventEmitter.subscribe(cb)
    },
    discord: {
        setActivity: () => { /* no-op (mock) */ }
    }
}

contextBridge.exposeInMainWorld('hellmc', hellmcApi)
