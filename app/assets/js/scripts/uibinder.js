/**
 * Initialize UI functions which depend on internal modules.
 * Loaded after core UI functions are initialized in uicore.js.
 */

// All Node.js modules come from window.launcherAPI (contextBridge).
var { ipc, app, win, config: ConfigManager, auth: AuthManager, lang: Lang, logger, distroTypes: Type } = window.launcherAPI

// helios-core distribution classes (HeliosDistribution/HeliosServer/HeliosModule) lose
// their prototype methods crossing contextBridge — structured-clone only keeps own data
// properties (rawServer, rawModule, required, mavenComponents, subModules, ...). These
// methods are pure derivations of that data, so reattach them here rather than editing
// every call site across the renderer scripts.
function _rehydrateModule(mdl) {
    mdl.getRequired = function () { return this.required }
    mdl.getPath = function () { return this.localPath }
    mdl.hasMavenComponents = function () { return this.mavenComponents != null }
    mdl.getMavenComponents = function () { return this.mavenComponents }
    mdl.getMavenIdentifier = function () {
        const c = this.mavenComponents
        return `${c.group}:${c.artifact}:${c.version}${c.classifier != null ? ':' + c.classifier : ''}${c.extension != null ? '@' + c.extension : ''}`
    }
    mdl.getExtensionlessMavenIdentifier = function () {
        const c = this.mavenComponents
        return `${c.group}:${c.artifact}:${c.version}${c.classifier != null ? ':' + c.classifier : ''}`
    }
    mdl.getVersionlessMavenIdentifier = function () {
        const c = this.mavenComponents
        return `${c.group}:${c.artifact}${c.classifier ? ':' + c.classifier : ''}`
    }
    mdl.hasSubModules = function () { return this.subModules.length > 0 }
    if (mdl.subModules) mdl.subModules.forEach(_rehydrateModule)
    return mdl
}

function _rehydrateDistribution(distro) {
    if (distro == null) return distro
    if (distro.servers) {
        distro.servers.forEach(serv => {
            if (serv.modules) serv.modules.forEach(_rehydrateModule)
        })
    }
    distro.getMainServer = function () {
        return this.mainServerIndex < this.servers.length ? this.servers[this.mainServerIndex] : null
    }
    distro.getServerById = function (id) {
        return this.servers.find(s => s.rawServer.id === id) || null
    }
    return distro
}

// window.launcherAPI.distro is deep-frozen by contextBridge, so it can't be
// monkey-patched in place. Wrap it instead — every renderer script shares this
// same global var (uibinder.js loads first).
var DistroAPI = {
    getDistribution:               async () => _rehydrateDistribution(await window.launcherAPI.distro.getDistribution()),
    refreshDistributionOrFallback: async () => _rehydrateDistribution(await window.launcherAPI.distro.refreshDistributionOrFallback()),
    toggleDevMode:                 (val) => window.launcherAPI.distro.toggleDevMode(val),
    isDevMode:                     ()    => window.launcherAPI.distro.isDevMode()
}

const loggerBinder = logger.getLogger('UIBinder')

let rscShouldLoad = false
let fatalStartupError = false

const VIEWS = {
    landing:      '#landingContainer',
    loginOptions: '#loginOptionsContainer',
    login:        '#loginContainer',
    settings:     '#settingsContainer',
    welcome:      '#welcomeContainer',
    waiting:      '#waitingContainer'
}

let currentView

function switchView(current, next, currentFadeTime = 500, nextFadeTime = 500, onCurrentFade = () => { }, onNextFade = () => { }) {
    currentView = next
    $(`${current}`).fadeOut(currentFadeTime, async () => {
        await onCurrentFade()
        $(`${next}`).fadeIn(nextFadeTime, async () => {
            await onNextFade()
        })
    })
}

function getCurrentView() {
    return currentView
}

async function showMainUI(data) {

    if (!app.isDev) {
        loggerAutoUpdater.info('Initializing..')
        ipc.send('autoUpdateAction', 'initAutoUpdater', ConfigManager.getAllowPrerelease())
    }

    await prepareSettings(true)
    updateSelectedServer(data.getServerById(ConfigManager.getSelectedServer()))
    refreshServerStatus()
    setTimeout(async () => {
        document.getElementById('frameBar').style.backgroundColor = 'rgba(0, 0, 0, 0.5)'
        document.body.style.backgroundImage = `url('assets/images/backgrounds/${document.body.getAttribute('bkid')}.jpg')`
        $('#main').show()

        let isLoggedIn = Object.keys(ConfigManager.getAuthAccounts()).length > 0

        if (isLoggedIn) {
            await validateSelectedAccount()
            isLoggedIn = Object.keys(ConfigManager.getAuthAccounts()).length > 0
        }

        if (ConfigManager.isFirstLaunch()) {
            currentView = VIEWS.welcome
            $(VIEWS.welcome).fadeIn(1000)
        } else {
            if (isLoggedIn) {
                currentView = VIEWS.landing
                $(VIEWS.landing).fadeIn(1000)
            } else {
                loginOptionsCancelEnabled(false)
                loginOptionsViewOnLoginSuccess = VIEWS.landing
                loginOptionsViewOnLoginCancel = VIEWS.loginOptions
                currentView = VIEWS.loginOptions
                $(VIEWS.loginOptions).fadeIn(1000)
            }
        }

        setTimeout(() => {
            $('#loadingContainer').fadeOut(500, () => {
                $('#loadSpinnerImage').removeClass('rotating')
            })
        }, 250)

    }, 750)
    initNews().then(() => {
        $('#newsContainer *').attr('tabindex', '-1')
    })
}

function showFatalStartupError() {
    setTimeout(() => {
        $('#loadingContainer').fadeOut(250, () => {
            document.getElementById('overlayContainer').style.background = 'none'
            setOverlayContent(
                Lang.queryJS('uibinder.startup.fatalErrorTitle'),
                Lang.queryJS('uibinder.startup.fatalErrorMessage'),
                Lang.queryJS('uibinder.startup.closeButton')
            )
            setOverlayHandler(() => {
                win.close()
            })
            toggleOverlay(true)
        })
    }, 750)
}

function onDistroRefresh(data) {
    updateSelectedServer(data.getServerById(ConfigManager.getSelectedServer()))
    refreshServerStatus()
    initNews()
    syncModConfigurations(data)
    ensureJavaSettings(data)
}

function syncModConfigurations(data) {

    const syncedCfgs = []

    for (let serv of data.servers) {

        const id   = serv.rawServer.id
        const mdls = serv.modules
        const cfg  = ConfigManager.getModConfiguration(id)

        if (cfg != null) {

            const modsOld = cfg.mods
            const mods    = {}

            for (let mdl of mdls) {
                const type = mdl.rawModule.type

                if (type === Type.ForgeMod || type === Type.LiteMod || type === Type.LiteLoader || type === Type.FabricMod) {
                    if (!mdl.getRequired().value) {
                        const mdlID = mdl.getVersionlessMavenIdentifier()
                        if (modsOld[mdlID] == null) {
                            mods[mdlID] = scanOptionalSubModules(mdl.subModules, mdl)
                        } else {
                            mods[mdlID] = mergeModConfiguration(modsOld[mdlID], scanOptionalSubModules(mdl.subModules, mdl), false)
                        }
                    } else {
                        if (mdl.subModules.length > 0) {
                            const mdlID = mdl.getVersionlessMavenIdentifier()
                            const v = scanOptionalSubModules(mdl.subModules, mdl)
                            if (typeof v === 'object') {
                                if (modsOld[mdlID] == null) {
                                    mods[mdlID] = v
                                } else {
                                    mods[mdlID] = mergeModConfiguration(modsOld[mdlID], v, true)
                                }
                            }
                        }
                    }
                }
            }

            syncedCfgs.push({ id, mods })

        } else {

            const mods = {}

            for (let mdl of mdls) {
                const type = mdl.rawModule.type
                if (type === Type.ForgeMod || type === Type.LiteMod || type === Type.LiteLoader || type === Type.FabricMod) {
                    if (!mdl.getRequired().value) {
                        mods[mdl.getVersionlessMavenIdentifier()] = scanOptionalSubModules(mdl.subModules, mdl)
                    } else {
                        if (mdl.subModules.length > 0) {
                            const v = scanOptionalSubModules(mdl.subModules, mdl)
                            if (typeof v === 'object') {
                                mods[mdl.getVersionlessMavenIdentifier()] = v
                            }
                        }
                    }
                }
            }

            syncedCfgs.push({ id, mods })
        }
    }

    ConfigManager.setModConfigurations(syncedCfgs)
    ConfigManager.save()
}

function ensureJavaSettings(data) {
    for (const serv of data.servers) {
        ConfigManager.ensureJavaConfig(serv.rawServer.id, serv.effectiveJavaOptions, serv.rawServer.javaOptions?.ram)
    }
    ConfigManager.save()
}

function scanOptionalSubModules(mdls, origin) {
    if (mdls != null) {
        const mods = {}

        for (let mdl of mdls) {
            const type = mdl.rawModule.type
            if (type === Type.ForgeMod || type === Type.LiteMod || type === Type.LiteLoader || type === Type.FabricMod) {
                if (!mdl.getRequired().value) {
                    mods[mdl.getVersionlessMavenIdentifier()] = scanOptionalSubModules(mdl.subModules, mdl)
                } else {
                    if (mdl.hasSubModules()) {
                        const v = scanOptionalSubModules(mdl.subModules, mdl)
                        if (typeof v === 'object') {
                            mods[mdl.getVersionlessMavenIdentifier()] = v
                        }
                    }
                }
            }
        }

        if (Object.keys(mods).length > 0) {
            const ret = { mods }
            if (!origin.getRequired().value) {
                ret.value = origin.getRequired().def
            }
            return ret
        }
    }
    return origin.getRequired().def
}

function mergeModConfiguration(o, n, nReq = false) {
    if (typeof o === 'boolean') {
        if (typeof n === 'boolean') return o
        else if (typeof n === 'object') {
            if (!nReq) n.value = o
            return n
        }
    } else if (typeof o === 'object') {
        if (typeof n === 'boolean') return typeof o.value !== 'undefined' ? o.value : true
        else if (typeof n === 'object') {
            if (!nReq) n.value = typeof o.value !== 'undefined' ? o.value : true
            const newMods = Object.keys(n.mods)
            for (let i = 0; i < newMods.length; i++) {
                const mod = newMods[i]
                if (o.mods[mod] != null) {
                    n.mods[mod] = mergeModConfiguration(o.mods[mod], n.mods[mod])
                }
            }
            return n
        }
    }
    return n
}

async function validateSelectedAccount() {
    const selectedAcc = ConfigManager.getSelectedAccount()
    if (selectedAcc != null) {
        const val = await AuthManager.validateSelected()
        if (!val) {
            ConfigManager.removeAuthAccount(selectedAcc.uuid)
            ConfigManager.save()
            const accLen = Object.keys(ConfigManager.getAuthAccounts()).length
            setOverlayContent(
                Lang.queryJS('uibinder.validateAccount.failedMessageTitle'),
                accLen > 0
                    ? Lang.queryJS('uibinder.validateAccount.failedMessage', { 'account': selectedAcc.displayName })
                    : Lang.queryJS('uibinder.validateAccount.failedMessageSelectAnotherAccount', { 'account': selectedAcc.displayName }),
                Lang.queryJS('uibinder.validateAccount.loginButton'),
                Lang.queryJS('uibinder.validateAccount.selectAnotherAccountButton')
            )
            setOverlayHandler(() => {

                const isMicrosoft = selectedAcc.type === 'microsoft'

                if (!isMicrosoft) {
                    document.getElementById('loginUsername').value = selectedAcc.username
                    validateEmail(selectedAcc.username)
                }

                loginOptionsViewOnLoginSuccess = getCurrentView()
                loginOptionsViewOnLoginCancel  = VIEWS.loginOptions

                if (accLen > 0) {
                    loginOptionsViewOnCancel = getCurrentView()
                    loginOptionsViewCancelHandler = () => {
                        if (isMicrosoft) {
                            ConfigManager.addMicrosoftAuthAccount(
                                selectedAcc.uuid,
                                selectedAcc.accessToken,
                                selectedAcc.username,
                                selectedAcc.expiresAt,
                                selectedAcc.microsoft.access_token,
                                selectedAcc.microsoft.refresh_token,
                                selectedAcc.microsoft.expires_at
                            )
                        } else {
                            ConfigManager.addMojangAuthAccount(selectedAcc.uuid, selectedAcc.accessToken, selectedAcc.username, selectedAcc.displayName)
                        }
                        ConfigManager.save()
                        validateSelectedAccount()
                    }
                    loginOptionsCancelEnabled(true)
                } else {
                    loginOptionsCancelEnabled(false)
                }
                toggleOverlay(false)
                switchView(getCurrentView(), VIEWS.loginOptions)
            })
            setDismissHandler(() => {
                if (accLen > 1) {
                    prepareAccountSelectionList()
                    $('#overlayContent').fadeOut(250, () => {
                        bindOverlayKeys(true, 'accountSelectContent', true)
                        $('#accountSelectContent').fadeIn(250)
                    })
                } else {
                    const accountsObj = ConfigManager.getAuthAccounts()
                    const accounts    = Array.from(Object.keys(accountsObj), v => accountsObj[v])
                    setSelectedAccount(accounts[0].uuid)
                    toggleOverlay(false)
                }
            })
            toggleOverlay(true, accLen > 0)
        } else {
            return true
        }
    } else {
        return true
    }
}

async function setSelectedAccount(uuid) {
    const authAcc = ConfigManager.setSelectedAccount(uuid)
    ConfigManager.save()
    updateSelectedAccount(authAcc)
    await validateSelectedAccount()
}

document.addEventListener('readystatechange', async () => {

    if (document.readyState === 'interactive' || document.readyState === 'complete') {
        if (rscShouldLoad) {
            rscShouldLoad = false
            if (!fatalStartupError) {
                const data = await DistroAPI.getDistribution()
                await showMainUI(data)
            } else {
                showFatalStartupError()
            }
        }
    }

}, false)

ipc.on('distributionIndexDone', async (res) => {
    if (res) {
        const data = await DistroAPI.getDistribution()
        syncModConfigurations(data)
        ensureJavaSettings(data)
        if (document.readyState === 'interactive' || document.readyState === 'complete') {
            await showMainUI(data)
        } else {
            rscShouldLoad = true
        }
    } else {
        fatalStartupError = true
        if (document.readyState === 'interactive' || document.readyState === 'complete') {
            showFatalStartupError()
        } else {
            rscShouldLoad = true
        }
    }
})

async function devModeToggle() {
    DistroAPI.toggleDevMode(true)
    const data = await DistroAPI.refreshDistributionOrFallback()
    ensureJavaSettings(data)
    updateSelectedServer(data.servers[0])
    syncModConfigurations(data)
}

ipc.send('requestDistributionIndexStatus')
