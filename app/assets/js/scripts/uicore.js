/**
 * Core UI functions are initialized in this file. This prevents
 * unexpected errors from breaking the core features. Specifically,
 * actions in this file should not require the usage of any internal
 * modules, excluding dependencies.
 */

// All Node.js APIs come from the contextBridge (window.launcherAPI).
// jQuery ($) is loaded as a plain browser <script> tag in app.ejs.

var { ipc, win, app, shell, webFrame: wf, system, logger, lang: Lang } = window.launcherAPI

const loggerUICore      = logger.getLogger('UICore')
const loggerAutoUpdater = logger.getLogger('AutoUpdater')

// Disable zoom, needed for darwin.
wf.setZoomLevel(0)
wf.setVisualZoomLevelLimits(1, 1)

// Disable eval function.
window.eval = function () {
    throw new Error('Sorry, this app does not support window.eval().')
}

// Initialize auto updates in production environments.
let updateCheckListener
if (!app.isDev) {
    ipc.on('autoUpdateNotification', (arg, info) => {
        switch (arg) {
            case 'checking-for-update':
                loggerAutoUpdater.info('Checking for update..')
                settingsUpdateButtonStatus(Lang.queryJS('uicore.autoUpdate.checkingForUpdateButton'), true)
                break
            case 'update-available':
                loggerAutoUpdater.info('New update available', info.version)

                if (system.platform === 'darwin') {
                    info.darwindownload = `https://github.com/TnTVlogs/HellMC-Client/releases/latest/download/HellMC-Client-setup${system.arch === 'arm64' ? '-arm64' : '-x64'}.dmg`
                    showUpdateUI(info)
                }

                populateSettingsUpdateInformation(info)
                break
            case 'update-downloaded':
                loggerAutoUpdater.info('Update ' + info.version + ' ready to be installed.')
                settingsUpdateButtonStatus(Lang.queryJS('uicore.autoUpdate.installNowButton'), false, () => {
                    if (!app.isDev) {
                        ipc.send('autoUpdateAction', 'installUpdateNow')
                    }
                })
                showUpdateUI(info)
                break
            case 'update-not-available':
                loggerAutoUpdater.info('No new update found.')
                settingsUpdateButtonStatus(Lang.queryJS('uicore.autoUpdate.checkForUpdatesButton'))
                break
            case 'ready':
                updateCheckListener = setInterval(() => {
                    ipc.send('autoUpdateAction', 'checkForUpdate')
                }, 1800000)
                ipc.send('autoUpdateAction', 'checkForUpdate')
                break
            case 'realerror':
                if (info != null && info.code != null) {
                    if (info.code === 'ERR_UPDATER_INVALID_RELEASE_FEED') {
                        loggerAutoUpdater.info('No suitable releases found.')
                    } else if (info.code === 'ERR_XML_MISSED_ELEMENT') {
                        loggerAutoUpdater.info('No releases found.')
                    } else {
                        loggerAutoUpdater.error('Error during update check..', info)
                        loggerAutoUpdater.debug('Error Code:', info.code)
                    }
                }
                break
            default:
                loggerAutoUpdater.info('Unknown argument', arg)
                break
        }
    })
}

function changeAllowPrerelease(val) {
    ipc.send('autoUpdateAction', 'allowPrereleaseChange', val)
}

function showUpdateUI(info) {
    document.getElementById('image_seal_container').setAttribute('update', true)
    document.getElementById('image_seal_container').onclick = () => {
        switchView(getCurrentView(), VIEWS.settings, 500, 500, () => {
            settingsNavItemListener(document.getElementById('settingsNavUpdate'), false)
        })
    }
}

document.addEventListener('readystatechange', function () {
    if (document.readyState === 'interactive') {
        loggerUICore.info('UICore Initializing..')

        Array.from(document.getElementsByClassName('fCb')).map((val) => {
            val.addEventListener('click', e => {
                win.close()
            })
        })

        Array.from(document.getElementsByClassName('fRb')).map((val) => {
            val.addEventListener('click', e => {
                win.toggleMaximize()
                document.activeElement.blur()
            })
        })

        Array.from(document.getElementsByClassName('fMb')).map((val) => {
            val.addEventListener('click', e => {
                win.minimize()
                document.activeElement.blur()
            })
        })

        Array.from(document.getElementsByClassName('mediaURL')).map(val => {
            val.addEventListener('click', e => {
                document.activeElement.blur()
            })
        })

    } else if (document.readyState === 'complete') {
        document.getElementById('launch_details').style.maxWidth = 266.01
        document.getElementById('launch_progress').style.width = 170.8
        document.getElementById('launch_details_right').style.maxWidth = 170.8
        document.getElementById('launch_progress_label').style.width = 53.21
    }

}, false)

$(document).on('click', 'a[href^="http"]', function (event) {
    event.preventDefault()
    shell.openExternal(this.href)
})
