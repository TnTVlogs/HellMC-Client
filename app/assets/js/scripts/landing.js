/**
 * Script for landing.ejs
 */

// All Node.js APIs come from window.launcherAPI (contextBridge).
// URL and crypto are browser globals — no require needed.
var {
    ipc,
    win,
    app,
    lang: Lang,
    logger,
    config: ConfigManager,
    mojang: MojangAPI,
    java: JavaUtils,
    files: FileUtils,
    discord,
    game,
    semver: SemverUtils
} = window.launcherAPI

const { RestResponseStatus } = MojangAPI

// Launch Elements
const launch_content           = document.getElementById('launch_content')
const launch_details           = document.getElementById('launch_details')
const launch_progress          = document.getElementById('launch_progress')
const launch_progress_label    = document.getElementById('launch_progress_label')
const launch_details_text      = document.getElementById('launch_details_text')
const server_selection_button  = document.getElementById('server_selection_button')
const user_text                = document.getElementById('user_text')

const loggerLanding = logger.getLogger('Landing')

/* Launch Progress Wrapper Functions */

function toggleLaunchArea(loading) {
    if (loading) {
        launch_details.style.display = 'flex'
        launch_content.style.display = 'none'
    } else {
        launch_details.style.display = 'none'
        launch_content.style.display = 'inline-flex'
    }
}

function setLaunchDetails(details) {
    launch_details_text.innerHTML = details
}

function setLaunchPercentage(percent) {
    launch_progress.setAttribute('max', 100)
    launch_progress.setAttribute('value', percent)
    launch_progress_label.innerHTML = percent + '%'
}

function setDownloadPercentage(percent) {
    win.setProgressBar(percent / 100)
    setLaunchPercentage(percent)
}

function setLaunchEnabled(val) {
    document.getElementById('launch_button').disabled = !val
}

// Bind launch button
document.getElementById('launch_button').addEventListener('click', async e => {
    if (game.isRunning()) {
        loggerLanding.info('Game is already running.')
        showLaunchFailure(Lang.queryJS('landing.launch.alreadyRunning'), Lang.queryJS('landing.launch.alreadyRunning'))
        return
    }
    loggerLanding.info('Launching game..')
    try {
        const server = (await DistroAPI.getDistribution()).getServerById(ConfigManager.getSelectedServer())
        const jExe   = ConfigManager.getJavaExecutable(ConfigManager.getSelectedServer())
        if (jExe == null) {
            await asyncSystemScan(server.effectiveJavaOptions)
        } else {

            setLaunchDetails(Lang.queryJS('landing.launch.pleaseWait'))
            toggleLaunchArea(true)
            setLaunchPercentage(0, 100)

            const details = await JavaUtils.validateSelectedJvm(jExe, server.effectiveJavaOptions.supported)
            if (details != null) {
                loggerLanding.info('Jvm Details', details)
                await dlAsync()
            } else {
                await asyncSystemScan(server.effectiveJavaOptions)
            }
        }
    } catch (err) {
        loggerLanding.error('Unhandled error in during launch process.', err)
        showLaunchFailure(Lang.queryJS('landing.launch.failureTitle'), Lang.queryJS('landing.launch.failureText'))
    }
})

// Bind settings button
document.getElementById('settingsMediaButton').onclick = async e => {
    await prepareSettings()
    switchView(getCurrentView(), VIEWS.settings)
}

// Bind avatar overlay button.
document.getElementById('avatarOverlay').onclick = async e => {
    await prepareSettings()
    switchView(getCurrentView(), VIEWS.settings, 500, 500, () => {
        settingsNavItemListener(document.getElementById('settingsNavAccount'), false)
    })
}

// Bind selected account
function updateSelectedAccount(authUser) {
    let username = Lang.queryJS('landing.selectedAccount.noAccountSelected')
    if (authUser != null) {
        if (authUser.displayName != null) {
            username = authUser.displayName
        }
        if (authUser.uuid != null) {
            document.getElementById('avatarContainer').style.backgroundImage = `url('https://minotar.net/helm/${authUser.displayName}')`
        }
    }
    user_text.innerHTML = username
}
updateSelectedAccount(ConfigManager.getSelectedAccount())

// Bind selected server
function updateSelectedServer(serv) {
    if (getCurrentView() === VIEWS.settings) {
        fullSettingsSave()
    }
    ConfigManager.setSelectedServer(serv != null ? serv.rawServer.id : null)
    ConfigManager.save()
    server_selection_button.innerHTML = '&#8226; ' + (serv != null ? serv.rawServer.name : Lang.queryJS('landing.noSelection'))
    if (getCurrentView() === VIEWS.settings) {
        animateSettingsTabRefresh()
    }
    setLaunchEnabled(serv != null)
}
// Real text is set in uibinder.js on distributionIndexDone.
server_selection_button.innerHTML = '&#8226; ' + Lang.queryJS('landing.selectedServer.loading')
server_selection_button.onclick = async e => {
    e.target.blur()
    await toggleServerSelection(true)
}

// Update Mojang Status Color
const refreshMojangStatuses = async function () {
    loggerLanding.info('Refreshing Mojang Statuses..')

    let status = 'grey'
    let tooltipEssentialHTML    = ''
    let tooltipNonEssentialHTML = ''

    const response = await MojangAPI.status()
    let statuses
    if (response.responseStatus === RestResponseStatus.SUCCESS) {
        statuses = response.data
    } else {
        loggerLanding.warn('Unable to refresh Mojang service status.')
        statuses = MojangAPI.getDefaultStatuses()
    }

    greenCount = 0
    greyCount  = 0

    for (let i = 0; i < statuses.length; i++) {
        const service = statuses[i]

        const tooltipHTML = `<div class="mojangStatusContainer">
            <span class="mojangStatusIcon" style="color: ${MojangAPI.statusToHex(service.status)};">&#8226;</span>
            <span class="mojangStatusName">${service.name}</span>
        </div>`
        if (service.essential) {
            tooltipEssentialHTML += tooltipHTML
        } else {
            tooltipNonEssentialHTML += tooltipHTML
        }

        if (service.status === 'yellow' && status !== 'red') {
            status = 'yellow'
        } else if (service.status === 'red') {
            status = 'red'
        } else {
            if (service.status === 'grey') {
                ++greyCount
            }
            ++greenCount
        }
    }

    if (greenCount === statuses.length) {
        if (greyCount === statuses.length) {
            status = 'grey'
        } else {
            status = 'green'
        }
    }

    document.getElementById('mojangStatusEssentialContainer').innerHTML    = tooltipEssentialHTML
    document.getElementById('mojangStatusNonEssentialContainer').innerHTML = tooltipNonEssentialHTML
    document.getElementById('mojang_status_icon').style.color              = MojangAPI.statusToHex(status)
}

const refreshServerStatus = async (fade = false) => {
    loggerLanding.info('Refreshing Server Status')
    const serv = (await DistroAPI.getDistribution()).getServerById(ConfigManager.getSelectedServer())

    let pLabel = Lang.queryJS('landing.serverStatus.server')
    let pVal   = Lang.queryJS('landing.serverStatus.offline')

    try {
        const servStat = await MojangAPI.getServerStatus(47, serv.hostname, serv.port)
        console.log(servStat)
        pLabel = Lang.queryJS('landing.serverStatus.players')
        pVal   = servStat.players.online + '/' + servStat.players.max
    } catch (err) {
        loggerLanding.warn('Unable to refresh server status, assuming offline.')
        loggerLanding.debug(err)
    }
    if (fade) {
        $('#server_status_wrapper').fadeOut(250, () => {
            document.getElementById('landingPlayerLabel').innerHTML = pLabel
            document.getElementById('player_count').innerHTML       = pVal
            $('#server_status_wrapper').fadeIn(500)
        })
    } else {
        document.getElementById('landingPlayerLabel').innerHTML = pLabel
        document.getElementById('player_count').innerHTML       = pVal
    }
}

refreshMojangStatuses()
// Server Status is refreshed in uibinder.js on distributionIndexDone.

let mojangStatusListener = setInterval(() => refreshMojangStatuses(true), 60 * 60 * 1000)
let serverStatusListener = setInterval(() => refreshServerStatus(true), 300000)

function showLaunchFailure(title, desc) {
    setOverlayContent(title, desc, Lang.queryJS('landing.launch.okay'))
    setOverlayHandler(null)
    toggleOverlay(true)
    toggleLaunchArea(false)
}

/* System (Java) Scan */

async function asyncSystemScan(effectiveJavaOptions, launchAfter = true) {

    setLaunchDetails(Lang.queryJS('landing.systemScan.checking'))
    toggleLaunchArea(true)
    setLaunchPercentage(0, 100)

    const jvmDetails = await JavaUtils.discoverBestJvmInstallation(
        ConfigManager.getDataDirectory(),
        effectiveJavaOptions.supported
    )

    if (jvmDetails == null) {
        setOverlayContent(
            Lang.queryJS('landing.systemScan.noCompatibleJava'),
            Lang.queryJS('landing.systemScan.installJavaMessage', { 'major': effectiveJavaOptions.suggestedMajor }),
            Lang.queryJS('landing.systemScan.installJava'),
            Lang.queryJS('landing.systemScan.installJavaManually')
        )
        setOverlayHandler(() => {
            setLaunchDetails(Lang.queryJS('landing.systemScan.javaDownloadPrepare'))
            toggleOverlay(false)

            try {
                downloadJava(effectiveJavaOptions, launchAfter)
            } catch (err) {
                loggerLanding.error('Unhandled error in Java Download', err)
                showLaunchFailure(Lang.queryJS('landing.systemScan.javaDownloadFailureTitle'), Lang.queryJS('landing.systemScan.javaDownloadFailureText'))
            }
        })
        setDismissHandler(() => {
            $('#overlayContent').fadeOut(250, () => {
                setOverlayContent(
                    Lang.queryJS('landing.systemScan.javaRequired', { 'major': effectiveJavaOptions.suggestedMajor }),
                    Lang.queryJS('landing.systemScan.javaRequiredMessage', { 'major': effectiveJavaOptions.suggestedMajor }),
                    Lang.queryJS('landing.systemScan.javaRequiredDismiss'),
                    Lang.queryJS('landing.systemScan.javaRequiredCancel')
                )
                setOverlayHandler(() => {
                    toggleLaunchArea(false)
                    toggleOverlay(false)
                })
                setDismissHandler(() => {
                    toggleOverlay(false, true)
                    asyncSystemScan(effectiveJavaOptions, launchAfter)
                })
                $('#overlayContent').fadeIn(250)
            })
        })
        toggleOverlay(true, true)
    } else {
        const javaExec = JavaUtils.javaExecFromRoot(jvmDetails.path)
        ConfigManager.setJavaExecutable(ConfigManager.getSelectedServer(), javaExec)
        ConfigManager.save()

        settingsJavaExecVal.value = javaExec
        await populateJavaExecDetails(settingsJavaExecVal.value)

        if (launchAfter) {
            await dlAsync()
        }
    }
}

async function downloadJava(effectiveJavaOptions, launchAfter = true) {

    const asset = await JavaUtils.latestOpenJDK(
        effectiveJavaOptions.suggestedMajor,
        ConfigManager.getDataDirectory(),
        effectiveJavaOptions.distribution
    )

    if (asset == null) {
        throw new Error(Lang.queryJS('landing.downloadJava.findJdkFailure'))
    }

    let received = 0
    await FileUtils.downloadFile(asset.url, asset.path, ({ transferred }) => {
        received = transferred
        setDownloadPercentage(Math.trunc((transferred / asset.size) * 100))
    })
    setDownloadPercentage(100)

    if (received != asset.size) {
        loggerLanding.warn(`Java Download: Expected ${asset.size} bytes but received ${received}`)
        if (!await FileUtils.validateLocalFile(asset.path, asset.algo, asset.hash)) {
            loggerLanding.error(`Hashes do not match, ${asset.id} may be corrupted.`)
            throw new Error(Lang.queryJS('landing.downloadJava.javaDownloadCorruptedError'))
        }
    }

    win.setProgressBar(2)

    const eLStr = Lang.queryJS('landing.downloadJava.extractingJava')
    let dotStr  = ''
    setLaunchDetails(eLStr)
    const extractListener = setInterval(() => {
        if (dotStr.length >= 3) {
            dotStr = ''
        } else {
            dotStr += '.'
        }
        setLaunchDetails(eLStr + dotStr)
    }, 750)

    const newJavaExec = await JavaUtils.extractJdk(asset.path)

    win.setProgressBar(-1)

    ConfigManager.setJavaExecutable(ConfigManager.getSelectedServer(), newJavaExec)
    ConfigManager.save()

    clearInterval(extractListener)
    setLaunchDetails(Lang.queryJS('landing.downloadJava.javaInstalled'))

    asyncSystemScan(effectiveJavaOptions, launchAfter)
}

// Is DiscordRPC enabled
let hasRPC = false
// RPC State Machine: 0=Idle/Menu, 1=Singleplayer, 2=Server
let currentRPCState = 0

const GAME_JOINED_REGEX     = /\[.+\]: Sound engine started/
const GAME_SINGLEPLAYER_REGEX = /\[.+\]: Starting integrated minecraft server/
const GAME_MENU_REGEX       = /\[.+\]: (?:Back to main menu|Quitting to main menu|Stopping!|Disconnected from server|Left the game|Closing NetworkManager|Stopping integrated minecraft server|Disconnecting|Instance shutdown|Render shutdown completed)/
const GAME_CONNECT_REGEX    = /\[.+\]: Connecting to ([^, ]+)/
const GAME_LAUNCH_REGEX     = /^\[.+\]: (?:MinecraftForge .+ Initialized|ModLauncher .+ starting: .+|Loading Minecraft .+ with Fabric Loader .+)$/
const MIN_LINGER            = 5000

/**
 * Resets the Discord RPC state and clears the active process reference.
 */
function resetGameState() {
    currentRPCState = 0
    if (hasRPC) {
        loggerLanding.info('Resetting Discord Rich Presence to Idle..')
        discord.updateActivity({
            details: Lang.queryJS('discord.waiting'),
            state:   Lang.queryJS('landing.discord.idle')
        })
    }
}

async function dlAsync(login = true) {

    ipc.send('game-status-changed', true)

    const loggerLaunchSuite = logger.getLogger('LaunchSuite')

    setLaunchDetails(Lang.queryJS('landing.dlAsync.loadingServerInfo'))

    let distro

    try {
        distro = await DistroAPI.refreshDistributionOrFallback()
        onDistroRefresh(distro)
    } catch (err) {
        loggerLaunchSuite.error('Unable to refresh distribution index.', err)
        showLaunchFailure(Lang.queryJS('landing.dlAsync.fatalError'), Lang.queryJS('landing.dlAsync.unableToLoadDistributionIndex'))
        ipc.send('game-status-changed', false)
        return
    }

    const serv = distro.getServerById(ConfigManager.getSelectedServer())

    if (login) {
        if (ConfigManager.getSelectedAccount() == null) {
            loggerLanding.error('You must be logged into an account.')
            ipc.send('game-status-changed', false)
            return
        }

        setLaunchDetails(Lang.queryJS('landing.dlAsync.pleaseWait'))
        const sessionValid = await validateSelectedAccount()
        if (!sessionValid) {
            ipc.send('game-status-changed', false)
            return
        }
    }

    setLaunchDetails(Lang.queryJS('landing.dlAsync.pleaseWait'))
    toggleLaunchArea(true)
    setLaunchPercentage(0, 100)

    // Create managed repair in preload context
    game.createRepair()

    game.onRepairError((msg) => {
        loggerLaunchSuite.error('Error during launch', msg)
        showLaunchFailure(Lang.queryJS('landing.dlAsync.errorDuringLaunchTitle'), msg || Lang.queryJS('landing.dlAsync.errorDuringLaunchText'))
    })
    game.onRepairClose((code) => {
        if (code !== 0) {
            loggerLaunchSuite.error(`Full Repair Module exited with code ${code}, assuming error.`)
            showLaunchFailure(Lang.queryJS('landing.dlAsync.errorDuringLaunchTitle'), Lang.queryJS('landing.dlAsync.seeConsoleForDetails'))
        }
    })

    loggerLaunchSuite.info('Validating files.')
    setLaunchDetails(Lang.queryJS('landing.dlAsync.validatingFileIntegrity'))
    let invalidFileCount = 0
    try {
        invalidFileCount = await game.verifyFiles(percent => {
            setLaunchPercentage(percent)
        })
        setLaunchPercentage(100)
    } catch (err) {
        loggerLaunchSuite.error('Error during file validation.')
        showLaunchFailure(Lang.queryJS('landing.dlAsync.errorDuringFileVerificationTitle'), err.displayable || Lang.queryJS('landing.dlAsync.seeConsoleForDetails'))
        return
    }

    if (invalidFileCount > 0) {
        loggerLaunchSuite.info('Downloading files.')
        setLaunchDetails(Lang.queryJS('landing.dlAsync.downloadingFiles'))
        setLaunchPercentage(0)
        try {
            await game.downloadFiles(percent => {
                setDownloadPercentage(percent)
            })
            setDownloadPercentage(100)
        } catch (err) {
            loggerLaunchSuite.error('Error during file download.')
            showLaunchFailure(Lang.queryJS('landing.dlAsync.errorDuringFileDownloadTitle'), err.displayable || Lang.queryJS('landing.dlAsync.seeConsoleForDetails'))
            return
        }
    } else {
        loggerLaunchSuite.info('No invalid files, skipping download.')
    }

    win.setProgressBar(-1)

    game.destroyRepair()

    setLaunchDetails(Lang.queryJS('landing.dlAsync.preparingToLaunch'))

    if (login) {
        const authUser = ConfigManager.getSelectedAccount()
        loggerLaunchSuite.info(`Sending selected account (${authUser.displayName}) to ProcessBuilder.`)

        const SERVER_JOINED_REGEX = new RegExp(`\\[.+\\]: \\[CHAT\\] ${authUser.displayName} joined the game`)

        // Reset RPC state for this launch.
        currentRPCState = 0

        // Temporary load detection listener — removed once game finishes loading.
        let tempListenerId = null
        let errListenerId  = null

        const onLoadComplete = () => {
            toggleLaunchArea(false)
            if (tempListenerId != null) { game.removeStdout(tempListenerId); tempListenerId = null }
            if (errListenerId  != null) { game.removeStderr(errListenerId);  errListenerId  = null }
        }

        const start = Date.now()

        const tempListener = (data) => {
            if (GAME_LAUNCH_REGEX.test(data.trim())) {
                const diff = Date.now() - start
                if (diff < MIN_LINGER) {
                    setTimeout(onLoadComplete, MIN_LINGER - diff)
                } else {
                    onLoadComplete()
                }
            }
        }

        let lastAttemptedIP = null
        const GAME_SERVER_CONFIRMED_JOIN_REGEX = /\[.+\]: (?:reloading ETF data|Loaded \d+ advancements|Creating pipeline for dimension)/

        const gameStateChange = (data) => {
            data = data.trim()

            if (SERVER_JOINED_REGEX.test(data)) {
                currentRPCState = 2
                discord.updateActivity({
                    details: Lang.queryJS('landing.discord.joined'),
                    state:   Lang.queryJS('landing.discord.playingAt', { ip: serv.rawServer.address })
                })
            } else if (GAME_CONNECT_REGEX.test(data)) {
                const match = GAME_CONNECT_REGEX.exec(data)
                lastAttemptedIP = match[1]
                discord.updateActivity({
                    details: Lang.queryJS('landing.discord.joining'),
                    state:   Lang.queryJS('landing.discord.idle')
                })
            } else if (GAME_SERVER_CONFIRMED_JOIN_REGEX.test(data) && lastAttemptedIP != null) {
                currentRPCState = 2
                lastAttemptedIP = null

                let displayAddress = serv.rawServer.address

                const PRIVATE_IP_REGEX = /^(?:10\.|127\.|172\.(?:1[6-9]|2\d|3[01])\.|192\.168\.|localhost)/
                const NUMERIC_IP_REGEX = /^\d{1,3}(?:\.\d{1,3}){3}$/
                if (NUMERIC_IP_REGEX.test(displayAddress) && PRIVATE_IP_REGEX.test(displayAddress)) {
                    displayAddress = Lang.queryJS('landing.discord.localServer')
                }

                discord.updateActivity({
                    details: Lang.queryJS('landing.discord.joined'),
                    state:   Lang.queryJS('landing.discord.playingAt', { ip: displayAddress })
                })
            } else if (GAME_SINGLEPLAYER_REGEX.test(data)) {
                currentRPCState = 1
                discord.updateActivity({
                    details: Lang.queryJS('landing.discord.joined'),
                    state:   Lang.queryJS('landing.discord.singleplayer')
                })
            } else if (GAME_MENU_REGEX.test(data) || data.includes('Stopping!') || data.includes('Stopped') || data.includes('Disconnected') || data.includes('Back to main menu')) {
                lastAttemptedIP = null
                if (currentRPCState !== 0) {
                    currentRPCState = 0
                    discord.updateActivity({
                        details: Lang.queryJS('landing.discord.joined'),
                        state:   Lang.queryJS('landing.discord.idle')
                    })
                }
            } else if (GAME_JOINED_REGEX.test(data)) {
                if (currentRPCState === 0) {
                    discord.updateActivity({
                        details: Lang.queryJS('landing.discord.joining'),
                        state:   Lang.queryJS('landing.discord.idle')
                    })
                }
            }
        }

        const gameErrorListener = (data) => {
            data = data.trim()
            if (data.indexOf('Could not find or load main class net.minecraft.launchwrapper.Launch') > -1) {
                loggerLaunchSuite.error('Game launch failed, LaunchWrapper was not downloaded properly.')
                showLaunchFailure(Lang.queryJS('landing.dlAsync.errorDuringLaunchTitle'), Lang.queryJS('landing.dlAsync.launchWrapperNotDownloaded'))
            }
        }

        try {
            setLaunchDetails(Lang.queryJS('landing.dlAsync.launchingGame'))

            // Register output listeners BEFORE starting the process.
            tempListenerId = game.onStdout(tempListener)
            errListenerId  = game.onStderr(gameErrorListener)

            // Build & start game process in preload (returns serialisable launch info).
            const launchInfo = await game.prepareAndLaunch(app.getVersion())

            if (hasRPC) {
                game.onStdout(gameStateChange)
            }

            // Init Discord RPC if configured and not already running.
            if (launchInfo.discord != null && !hasRPC) {
                discord.initRPC(launchInfo.discord.gen, launchInfo.discord.serv)
                hasRPC = true
                game.onStdout(gameStateChange)
            }

            setLaunchDetails(Lang.queryJS('landing.dlAsync.doneEnjoyServer'))

            ipc.send('game-status-changed', true)
            console.log('Game started, notifying main process..')

            game.onClose(() => {
                console.log('Game ended, notifying main process..')
                ipc.send('game-status-changed', false)
                resetGameState()
            })

        } catch (err) {
            loggerLaunchSuite.error('Error during launch', err)
            showLaunchFailure(Lang.queryJS('landing.dlAsync.errorDuringLaunchTitle'), Lang.queryJS('landing.dlAsync.checkConsoleForDetails'))
        }
    }
}

/**
 * News Loading Functions
 */

const newsContent                  = document.getElementById('newsContent')
const newsArticleTitle             = document.getElementById('newsArticleTitle')
const newsArticleDate              = document.getElementById('newsArticleDate')
const newsArticleAuthor            = document.getElementById('newsArticleAuthor')
const newsArticleComments          = document.getElementById('newsArticleComments')
const newsNavigationStatus         = document.getElementById('newsNavigationStatus')
const newsArticleContentScrollable = document.getElementById('newsArticleContentScrollable')
const nELoadSpan                   = document.getElementById('nELoadSpan')

let newsActive      = false
let newsGlideCount  = 0

function slide_(up) {
    const lCUpper      = document.querySelector('#landingContainer > #upper')
    const lCLLeft      = document.querySelector('#landingContainer > #lower > #left')
    const lCLCenter    = document.querySelector('#landingContainer > #lower > #center')
    const lCLRight     = document.querySelector('#landingContainer > #lower > #right')
    const newsBtn      = document.querySelector('#landingContainer > #lower > #center #content')
    const landingContainer = document.getElementById('landingContainer')
    const newsContainer= document.querySelector('#landingContainer > #newsContainer')

    newsGlideCount++

    if (up) {
        lCUpper.style.top    = '-200vh'
        lCLLeft.style.top    = '-200vh'
        lCLCenter.style.top  = '-200vh'
        lCLRight.style.top   = '-200vh'
        newsBtn.style.top    = '130vh'
        newsContainer.style.top = '0px'
        landingContainer.style.background = 'rgba(0, 0, 0, 0.50)'
        setTimeout(() => {
            if (newsGlideCount === 1) {
                lCLCenter.style.transition = 'none'
                newsBtn.style.transition   = 'none'
            }
            newsGlideCount--
        }, 2000)
    } else {
        setTimeout(() => {
            newsGlideCount--
        }, 2000)
        landingContainer.style.background  = null
        lCLCenter.style.transition         = null
        newsBtn.style.transition           = null
        newsContainer.style.top            = '100%'
        lCUpper.style.top                  = '0px'
        lCLLeft.style.top                  = '0px'
        lCLCenter.style.top                = '0px'
        lCLRight.style.top                 = '0px'
        newsBtn.style.top                  = '10px'
    }
}

document.getElementById('newsButton').onclick = () => {
    if (newsActive) {
        $('#landingContainer *').removeAttr('tabindex')
        $('#newsContainer *').attr('tabindex', '-1')
    } else {
        $('#landingContainer *').attr('tabindex', '-1')
        $('#newsContainer, #newsContainer *, #lower, #lower #center *').removeAttr('tabindex')
        if (newsAlertShown) {
            $('#newsButtonAlert').fadeOut(2000)
            newsAlertShown = false
            ConfigManager.setNewsCacheDismissed(true)
            ConfigManager.save()
        }
    }
    slide_(!newsActive)
    newsActive = !newsActive
}

let newsArr = null

let newsLoadingListener = null

function setNewsLoading(val) {
    if (val) {
        const nLStr = Lang.queryJS('landing.news.checking')
        let dotStr  = '..'
        nELoadSpan.innerHTML = nLStr + dotStr
        newsLoadingListener = setInterval(() => {
            if (dotStr.length >= 3) {
                dotStr = ''
            } else {
                dotStr += '.'
            }
            nELoadSpan.innerHTML = nLStr + dotStr
        }, 750)
    } else {
        if (newsLoadingListener != null) {
            clearInterval(newsLoadingListener)
            newsLoadingListener = null
        }
    }
}

const newsErrorRetry = document.getElementById('newsErrorRetry')
newsErrorRetry.onclick = () => {
    $('#newsErrorFailed').fadeOut(250, () => {
        initNews()
        $('#newsErrorLoading').fadeIn(250)
    })
}

newsArticleContentScrollable.onscroll = (e) => {
    if (e.target.scrollTop > Number.parseFloat($('.newsArticleSpacerTop').css('height'))) {
        newsContent.setAttribute('scrolled', '')
    } else {
        newsContent.removeAttribute('scrolled')
    }
}

function reloadNews() {
    return new Promise((resolve, reject) => {
        $('#newsContent').fadeOut(250, () => {
            $('#newsErrorLoading').fadeIn(250)
            initNews().then(() => {
                resolve()
            })
        })
    })
}

let newsAlertShown = false

function showNewsAlert() {
    newsAlertShown = true
    $(newsButtonAlert).fadeIn(250)
}

async function digestMessage(str) {
    const msgUint8   = new TextEncoder().encode(str)
    const hashBuffer = await crypto.subtle.digest('SHA-1', msgUint8)
    const hashArray  = Array.from(new Uint8Array(hashBuffer))
    const hashHex    = hashArray.map((b) => b.toString(16).padStart(2, '0')).join('')
    return hashHex
}

async function initNews() {

    setNewsLoading(true)

    const news = await loadNews()

    newsArr = news?.articles || null

    if (newsArr == null) {
        setNewsLoading(false)

        await $('#newsErrorLoading').fadeOut(250).promise()
        await $('#newsErrorFailed').fadeIn(250).promise()

    } else if (newsArr.length === 0) {
        setNewsLoading(false)

        ConfigManager.setNewsCache({
            date:      null,
            content:   null,
            dismissed: false
        })
        ConfigManager.save()

        await $('#newsErrorLoading').fadeOut(250).promise()
        await $('#newsErrorNone').fadeIn(250).promise()
    } else {
        setNewsLoading(false)

        const lN     = newsArr[0]
        const cached = ConfigManager.getNewsCache()
        let newHash  = await digestMessage(lN.content)
        let newDate  = new Date(lN.date)
        let isNew    = false

        if (cached.date != null && cached.content != null) {

            if (new Date(cached.date) >= newDate) {
                if (cached.content !== newHash) {
                    isNew = true
                    showNewsAlert()
                } else {
                    if (!cached.dismissed) {
                        isNew = true
                        showNewsAlert()
                    }
                }
            } else {
                isNew = true
                showNewsAlert()
            }

        } else {
            isNew = true
            showNewsAlert()
        }

        if (isNew) {
            ConfigManager.setNewsCache({
                date:      newDate.getTime(),
                content:   newHash,
                dismissed: false
            })
            ConfigManager.save()
        }

        const switchHandler = (forward) => {
            let cArt   = parseInt(newsContent.getAttribute('article'))
            let nxtArt = forward ? (cArt >= newsArr.length - 1 ? 0 : cArt + 1) : (cArt <= 0 ? newsArr.length - 1 : cArt - 1)
            displayArticle(newsArr[nxtArt], nxtArt + 1)
        }

        document.getElementById('newsNavigateRight').onclick = () => { switchHandler(true) }
        document.getElementById('newsNavigateLeft').onclick  = () => { switchHandler(false) }
        await $('#newsErrorContainer').fadeOut(250).promise()
        displayArticle(newsArr[0], 1)
        await $('#newsContent').fadeIn(250).promise()
    }
}

function displayArticle(articleObject, index) {
    newsArticleTitle.innerHTML   = articleObject.title
    newsArticleTitle.href        = articleObject.link
    newsArticleAuthor.innerHTML  = 'by ' + articleObject.author
    newsArticleDate.innerHTML    = articleObject.date
    newsArticleComments.innerHTML = articleObject.comments
    newsArticleComments.href     = articleObject.commentsLink
    newsArticleContentScrollable.innerHTML = '<div id="newsArticleContentWrapper"><div class="newsArticleSpacerTop"></div>' + articleObject.content + '<div class="newsArticleSpacerBot"></div></div>'
    Array.from(newsArticleContentScrollable.getElementsByClassName('bbCodeSpoilerButton')).forEach(v => {
        v.onclick = () => {
            const text = v.parentElement.getElementsByClassName('bbCodeSpoilerText')[0]
            text.style.display = text.style.display === 'block' ? 'none' : 'block'
        }
    })
    newsNavigationStatus.innerHTML = Lang.query('ejs.landing.newsNavigationStatus', { currentPage: index, totalPages: newsArr.length })
    newsContent.setAttribute('article', index - 1)
}

async function loadNews() {

    const distroData = await DistroAPI.getDistribution()
    if (!distroData.rawDistribution.rss) {
        loggerLanding.debug('No RSS feed provided.')
        return null
    }

    const promise = new Promise((resolve, reject) => {

        const newsFeed = distroData.rawDistribution.rss
        const newsHost = new URL(newsFeed).origin + '/'
        $.ajax({
            url: newsFeed,
            success: (data) => {
                const items    = $(data).find('item')
                const articles = []

                for (let i = 0; i < items.length; i++) {
                    const el = $(items[i])

                    const date = new Date(el.find('pubDate').text()).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: 'numeric' })

                    let comments = el.find('slash\\:comments').text() || '0'
                    comments = comments + ' Comment' + (comments === '1' ? '' : 's')

                    let content = el.find('content\\:encoded').text()
                    let regex   = /src="(?!http:\/\/|https:\/\/)(.+?)"/g
                    let matches
                    while ((matches = regex.exec(content))) {
                        content = content.replace(`"${matches[1]}"`, `"${newsHost + matches[1]}"`)
                    }

                    let link   = el.find('link').text()
                    let title  = el.find('title').text()
                    let author = el.find('dc\\:creator').text()

                    articles.push({ link, title, date, author, content, comments, commentsLink: link + '#comments' })
                }
                resolve({ articles })
            },
            timeout: 2500
        }).catch(err => {
            resolve({ articles: null })
        })
    })

    return await promise
}

// Init Discord RPC early if possible
const initEarlyRPC = async () => {
    try {
        const distro = await DistroAPI.getDistribution()
        if (!distro || !distro.rawDistribution) return
        const selectedServ = ConfigManager.getSelectedServer()
        if (!selectedServ) return
        const serv = distro.getServerById(selectedServ)
        if (!serv || !serv.rawServer) return

        if (distro.rawDistribution.discord != null && serv.rawServer.discord != null) {
            discord.initRPC(distro.rawDistribution.discord, serv.rawServer.discord, Lang.queryJS('discord.waiting'), Lang.queryJS('landing.discord.idle'))
            hasRPC = true
        }
    } catch (err) {
        loggerLanding.error('Error during early RPC init', err)
    }
}

initEarlyRPC()
