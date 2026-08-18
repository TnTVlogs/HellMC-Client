'use strict'

const { contextBridge, ipcRenderer, shell, webFrame } = require('electron')
const remote = require('@electron/remote')
const fs = require('fs-extra')
const os = require('os')
const path = require('path')
const semver = require('semver')

const { LoggerUtil } = require('helios-core')
const { HeliosDistribution } = require('helios-core/common')
const {
    RestResponseStatus,
    isDisplayableError,
    validateLocalFile
} = require('helios-core/common')
const {
    FullRepair,
    DistributionIndexProcessor,
    MojangIndexProcessor,
    downloadFile
} = require('helios-core/dl')
const {
    validateSelectedJvm,
    ensureJavaDirIsRoot,
    javaExecFromRoot,
    discoverBestJvmInstallation,
    latestOpenJDK,
    extractJdk
} = require('helios-core/java')
const { MojangRestAPI, getServerStatus } = require('helios-core/mojang')
const { Type } = require('helios-distribution-types')

const ConfigManager  = require('./configmanager')
const { DistroAPI }  = require('./distromanager')
const LangLoader     = require('./langloader')
const AuthManager    = require('./authmanager')
const DiscordWrapper = require('./discordwrapper')
const ProcessBuilder = require('./processbuilder')
const { MSFT_OPCODE, MSFT_REPLY_TYPE, MSFT_ERROR, SHELL_OPCODE } = require('./ipcconstants')

// ─── Preloader Initialisation (former preloader.js) ──────────────────────────

const logger = LoggerUtil.getLogger('Preloader')
logger.info('Loading..')

ConfigManager.load()

DistroAPI['commonDir']   = ConfigManager.getCommonDirectory()
DistroAPI['instanceDir'] = ConfigManager.getInstanceDirectory()

LangLoader.setupLanguage()

function onDistroLoad(data) {
    if (data != null) {
        if (ConfigManager.getSelectedServer() == null || data.getServerById(ConfigManager.getSelectedServer()) == null) {
            logger.info('Determining default selected server..')
            ConfigManager.setSelectedServer(data.getMainServer().rawServer.id)
            ConfigManager.save()
        }
    }
    ipcRenderer.send('distributionIndexDone', data != null)
}

DistroAPI.getDistribution()
    .then(heliosDistro => {
        logger.info('Loaded distribution index.')
        onDistroLoad(heliosDistro)
    })
    .catch(err => {
        logger.info('Failed to load distribution index.')
        logger.error(err)
        onDistroLoad(null)
    })

fs.remove(path.join(os.tmpdir(), ConfigManager.getTempNativeFolder()), (err) => {
    if (err) {
        logger.warn('Error while cleaning natives directory', err)
    } else {
        logger.info('Cleaned natives directory.')
    }
})

// ─── Line-buffering helper (used by process output listeners) ────────────────

function lineBuffered(onLine) {
    let buffer = ''
    return (data) => {
        buffer += data.toString()
        const lines = buffer.split(/\r?\n/)
        buffer = lines.pop()
        for (const line of lines) {
            onLine(line)
        }
    }
}

// ─── Managed game process state ───────────────────────────────────────────────

let _proc           = null
let _repair         = null
let _nextListenerId = 1
const _stdoutListeners = new Map()
const _stderrListeners = new Map()
const _closeListeners  = new Map()

function _addListener(map, cb) {
    const id = _nextListenerId++
    map.set(id, cb)
    return id
}

function _fireListeners(map, ...args) {
    map.forEach(cb => { try { cb(...args) } catch (_) {} })
}

// ─── IPC channel allowlist ────────────────────────────────────────────────────

const ALLOWED_SEND = [
    'autoUpdateAction',
    'game-status-changed',
    'requestDistributionIndexStatus',
    'reload-renderer',
    'request-game-status',
    MSFT_OPCODE.OPEN_LOGIN,
    MSFT_OPCODE.OPEN_LOGOUT,
    SHELL_OPCODE.TRASH_ITEM
]

const ALLOWED_RECV = [
    'autoUpdateNotification',
    'distributionIndexDone',
    'game-status-changed',
    'game-status-response',
    MSFT_OPCODE.REPLY_LOGIN,
    MSFT_OPCODE.REPLY_LOGOUT
]

// ─── Context Bridge ───────────────────────────────────────────────────────────

contextBridge.exposeInMainWorld('launcherAPI', {

    // ── IPC ──────────────────────────────────────────────────────────────────
    ipc: {
        send: (channel, ...args) => {
            if (ALLOWED_SEND.includes(channel)) ipcRenderer.send(channel, ...args)
        },
        on: (channel, cb) => {
            if (!ALLOWED_RECV.includes(channel)) return () => {}
            const fn = (_, ...args) => cb(...args)
            ipcRenderer.on(channel, fn)
            return fn
        },
        once: (channel, cb) => {
            if (!ALLOWED_RECV.includes(channel)) return
            ipcRenderer.once(channel, (_, ...args) => cb(...args))
        },
        removeAllListeners: (channel) => ipcRenderer.removeAllListeners(channel),
        removeListener: (channel, fn) => ipcRenderer.removeListener(channel, fn)
    },

    // ── Electron window controls ──────────────────────────────────────────────
    win: {
        close:          () => remote.getCurrentWindow().close(),
        minimize:       () => remote.getCurrentWindow().minimize(),
        toggleMaximize: () => {
            const w = remote.getCurrentWindow()
            w.isMaximized() ? w.unmaximize() : w.maximize()
        },
        isMaximized:    () => remote.getCurrentWindow().isMaximized(),
        setProgressBar: (val) => remote.getCurrentWindow().setProgressBar(val)
    },

    // ── App info ──────────────────────────────────────────────────────────────
    app: {
        getVersion: () => remote.app.getVersion(),
        isDev:      require('./isdev')
    },

    // ── Shell ─────────────────────────────────────────────────────────────────
    shell: {
        openExternal: (url) => shell.openExternal(url),
        trashItem:    (p)   => shell.trashItem(p)
    },

    // ── webFrame ──────────────────────────────────────────────────────────────
    webFrame: {
        setZoomLevel:            (level)      => webFrame.setZoomLevel(level),
        setVisualZoomLevelLimits:(min, max)   => webFrame.setVisualZoomLevelLimits(min, max)
    },

    // ── System ────────────────────────────────────────────────────────────────
    system: {
        platform: process.platform,
        arch:     process.arch,
        totalmem: () => os.totalmem(),
        freemem:  () => os.freemem()
    },

    // ── Logger factory ────────────────────────────────────────────────────────
    logger: {
        getLogger: (name) => {
            const l = LoggerUtil.getLogger(name)
            return {
                info:  (...a) => l.info(...a),
                warn:  (...a) => l.warn(...a),
                error: (...a) => l.error(...a),
                debug: (...a) => l.debug(...a)
            }
        }
    },

    // ── Language ──────────────────────────────────────────────────────────────
    lang: {
        queryJS:  (id, params) => LangLoader.queryJS(id, params),
        queryEJS: (id, params) => LangLoader.queryEJS(id, params),
        query:    (id, params) => LangLoader.query(id, params)
    },

    // ── Config Manager ────────────────────────────────────────────────────────
    config: {
        load:  () => ConfigManager.load(),
        save:  () => ConfigManager.save(),

        // Dynamic access for settings.js generic save/load
        dynamicGet:      (cValue, ...args) => ConfigManager['get'      + cValue]?.(...args),
        dynamicSet:      (cValue, ...args) => ConfigManager['set'      + cValue]?.(...args),
        dynamicValidate: (cValue, ...args) => ConfigManager['validate' + cValue]?.(...args),
        hasGetter:       (cValue)          => typeof ConfigManager['get'      + cValue] === 'function',
        hasSetter:       (cValue)          => typeof ConfigManager['set'      + cValue] === 'function',
        hasValidator:    (cValue)          => typeof ConfigManager['validate' + cValue] === 'function',

        // Concrete accessors used across renderer scripts
        getSelectedServer:    ()       => ConfigManager.getSelectedServer(),
        setSelectedServer:    (id)     => ConfigManager.setSelectedServer(id),
        getSelectedAccount:   ()       => ConfigManager.getSelectedAccount(),
        setSelectedAccount:   (uuid)   => ConfigManager.setSelectedAccount(uuid),
        getAuthAccounts:      ()       => ConfigManager.getAuthAccounts(),
        getAuthAccount:       (uuid)   => ConfigManager.getAuthAccount(uuid),
        addMojangAuthAccount: (...a)   => ConfigManager.addMojangAuthAccount(...a),
        addMicrosoftAuthAccount: (...a)=> ConfigManager.addMicrosoftAuthAccount(...a),
        removeAuthAccount:    (uuid)   => ConfigManager.removeAuthAccount(uuid),
        isFirstLaunch:        ()       => ConfigManager.isFirstLaunch(),
        getModConfiguration:  (id)     => ConfigManager.getModConfiguration(id),
        setModConfiguration:  (id, cfg)=> ConfigManager.setModConfiguration(id, cfg),
        setModConfigurations: (cfgs)   => ConfigManager.setModConfigurations(cfgs),
        ensureJavaConfig:     (...a)   => ConfigManager.ensureJavaConfig(...a),
        getAllowPrerelease:    ()       => ConfigManager.getAllowPrerelease(),
        getCommonDirectory:   ()       => ConfigManager.getCommonDirectory(),
        getInstanceDirectory: ()       => ConfigManager.getInstanceDirectory(),
        getLauncherDirectory: ()       => ConfigManager.getLauncherDirectory(),
        getDataDirectory:     ()       => ConfigManager.getDataDirectory(),
        getTempNativeFolder:  ()       => ConfigManager.getTempNativeFolder(),
        getLanguage:          ()       => ConfigManager.getLanguage(),
        setLanguage:          (lang)   => ConfigManager.setLanguage(lang),
        getAbsoluteMaxRAM:    (ram)    => ConfigManager.getAbsoluteMaxRAM(ram),
        getAbsoluteMinRAM:    (ram)    => ConfigManager.getAbsoluteMinRAM(ram),
        getJavaExecutable:    (id)     => ConfigManager.getJavaExecutable(id),
        setJavaExecutable:    (id, p)  => ConfigManager.setJavaExecutable(id, p),
        getJVMOptions:        (id)     => ConfigManager.getJVMOptions(id),
        getMinRAM:            (id)     => ConfigManager.getMinRAM(id),
        getMaxRAM:            (id)     => ConfigManager.getMaxRAM(id),
        getNewsCacheDismissed:()       => ConfigManager.getNewsCacheDismissed(),
        setNewsCacheDismissed:(val)    => ConfigManager.setNewsCacheDismissed(val),
        getNewsCache:         ()       => ConfigManager.getNewsCache(),
        setNewsCache:         (val)    => ConfigManager.setNewsCache(val),
        isLoaded:             ()       => ConfigManager.isLoaded()
    },

    // ── Distribution API ──────────────────────────────────────────────────────
    distro: {
        getDistribution:              ()    => DistroAPI.getDistribution(),
        refreshDistributionOrFallback:()    => DistroAPI.refreshDistributionOrFallback(),
        toggleDevMode:                (val) => DistroAPI.toggleDevMode(val),
        isDevMode:                    ()    => DistroAPI.isDevMode()
    },

    // ── Auth Manager ──────────────────────────────────────────────────────────
    auth: {
        validateSelected:       ()     => AuthManager.validateSelected(),
        addMojangAccount:       (user) => AuthManager.addMojangAccount(user),
        addMicrosoftAccount:    (code) => AuthManager.addMicrosoftAccount(code),
        removeMojangAccount:    (uuid) => AuthManager.removeMojangAccount(uuid),
        removeMicrosoftAccount: (uuid) => AuthManager.removeMicrosoftAccount(uuid),
        isDisplayableError:     (err)  => isDisplayableError(err)
    },

    // ── Mojang / Server Status ────────────────────────────────────────────────
    mojang: {
        status:            ()              => MojangRestAPI.status(),
        statusToHex:       (s)             => MojangRestAPI.statusToHex(s),
        getDefaultStatuses:()              => MojangRestAPI.getDefaultStatuses(),
        getServerStatus:   (protocol, host, port) => getServerStatus(protocol, host, port),
        RestResponseStatus
    },

    // ── semver ────────────────────────────────────────────────────────────────
    semver: {
        gte:        (a, b) => semver.gte(a, b),
        lte:        (a, b) => semver.lte(a, b),
        lt:         (a, b) => semver.lt(a, b),
        gt:         (a, b) => semver.gt(a, b),
        coerce:     (s)    => semver.coerce(s)?.toString() ?? null,
        prerelease: (v)    => semver.prerelease(v),
        valid:      (s)    => semver.valid(s)
    },

    // ── helios-distribution-types ─────────────────────────────────────────────
    distroTypes: {
        ForgeMod:   Type.ForgeMod,
        LiteMod:    Type.LiteMod,
        LiteLoader: Type.LiteLoader,
        FabricMod:  Type.FabricMod
    },

    // ── File / validation utilities ───────────────────────────────────────────
    files: {
        validateLocalFile: (p, algo, hash)   => validateLocalFile(p, algo, hash),
        downloadFile:      (url, p, progressCb) => downloadFile(url, p, progressCb),
        pathJoin:          (...parts)        => path.join(...parts),
        pathDirname:       (p)              => path.dirname(p),
        pathResolve:       (p)              => path.resolve(p)
    },

    // ── Dialog ────────────────────────────────────────────────────────────────
    dialog: {
        showOpenDialog: (options) => remote.dialog.showOpenDialog(remote.getCurrentWindow(), options)
    },

    // ── IPC constants (used by settings.js / login flows) ─────────────────────
    ipcConstants: {
        MSFT_OPCODE,
        MSFT_REPLY_TYPE,
        MSFT_ERROR,
        SHELL_OPCODE
    },

    // ── Discord RPC ───────────────────────────────────────────────────────────
    discord: {
        initRPC:        (gen, serv) => DiscordWrapper.initRPC(gen, serv),
        updateActivity: (activity)  => DiscordWrapper.updateActivity(activity),
        clearActivity:  ()          => DiscordWrapper.clearActivity(),
        shutdownRPC:    ()          => DiscordWrapper.shutdownRPC()
    },

    // ── Java utilities ────────────────────────────────────────────────────────
    java: {
        validateSelectedJvm:        (jPath, supported)          => validateSelectedJvm(ensureJavaDirIsRoot(jPath), supported),
        discoverBestJvmInstallation:(dataDir, supported)        => discoverBestJvmInstallation(dataDir, supported),
        javaExecFromRoot:           (p)                         => javaExecFromRoot(p),
        latestOpenJDK:              (major, dataDir, dist)      => latestOpenJDK(major, dataDir, dist),
        extractJdk:                 (assetPath)                 => extractJdk(assetPath),
        ensureJavaDirIsRoot:        (p)                         => ensureJavaDirIsRoot(p)
    },

    // ── Managed game process ─────────────────────────────────────────────────
    game: {

        // ── Repair ────────────────────────────────────────────────────────────
        createRepair: () => {
            _repair = new FullRepair(
                ConfigManager.getCommonDirectory(),
                ConfigManager.getInstanceDirectory(),
                ConfigManager.getLauncherDirectory(),
                ConfigManager.getSelectedServer(),
                DistroAPI.isDevMode()
            )
            _repair.spawnReceiver()
        },

        onRepairError: (cb) => {
            _repair.childProcess.on('error', (err) => cb(err.message || String(err)))
        },

        onRepairClose: (cb) => {
            _repair.childProcess.on('close', (code) => cb(code))
        },

        verifyFiles: (progressCb) => _repair.verifyFiles(progressCb),

        downloadFiles: (progressCb) => _repair.download(progressCb),

        destroyRepair: () => {
            if (_repair) {
                _repair.destroyReceiver()
                _repair = null
            }
        },

        // ── Launch prep: resolve version/modloader data ───────────────────────
        // Returns serialisable info needed by the renderer to build the proc.
        // The actual ProcessBuilder is also created here so it lives in Node context.
        prepareAndLaunch: async (appVersion) => {
            const distro    = await DistroAPI.getDistribution()
            const serv      = distro.getServerById(ConfigManager.getSelectedServer())
            const authUser  = ConfigManager.getSelectedAccount()

            const mojangProcessor  = new MojangIndexProcessor(
                ConfigManager.getCommonDirectory(),
                serv.rawServer.minecraftVersion
            )
            const distroProcessor  = new DistributionIndexProcessor(
                ConfigManager.getCommonDirectory(),
                distro,
                serv.rawServer.id
            )

            const modLoaderData = await distroProcessor.loadModLoaderVersionJson(serv)
            const versionData   = await mojangProcessor.getVersionJson()

            const pb = new ProcessBuilder(serv, versionData, modLoaderData, authUser, appVersion)
            _proc = pb.build()

            _proc.stdout.on('data', lineBuffered(line => _fireListeners(_stdoutListeners, line)))
            _proc.stderr.on('data', lineBuffered(line => _fireListeners(_stderrListeners, line)))

            const onProcEnd = () => {
                if (_proc) {
                    _fireListeners(_closeListeners)
                    _proc = null
                    _stdoutListeners.clear()
                    _stderrListeners.clear()
                    _closeListeners.clear()
                }
            }
            _proc.on('close', onProcEnd)
            _proc.on('exit',  onProcEnd)

            // Return serialisable server/discord info the renderer needs.
            return {
                pid:           _proc.pid,
                serverAddress: serv.rawServer.address,
                displayName:   authUser.displayName,
                discord: (distro.rawDistribution.discord != null && serv.rawServer.discord != null)
                    ? { gen: distro.rawDistribution.discord, serv: serv.rawServer.discord }
                    : null
            }
        },

        // ── Process output listeners (ID-based so renderer can remove them) ───
        onStdout: (cb) => _addListener(_stdoutListeners, cb),
        onStderr: (cb) => _addListener(_stderrListeners, cb),
        onClose:  (cb) => _addListener(_closeListeners,  cb),

        removeStdout: (id) => _stdoutListeners.delete(id),
        removeStderr: (id) => _stderrListeners.delete(id),
        removeClose:  (id) => _closeListeners.delete(id),

        clearListeners: () => {
            _stdoutListeners.clear()
            _stderrListeners.clear()
            _closeListeners.clear()
        },

        isRunning: () => _proc != null,

        kill: () => { if (_proc) _proc.kill('SIGKILL') }
    }
})

process.traceProcessWarnings = true
process.traceDeprecation     = true
