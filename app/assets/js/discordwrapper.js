// Work in progress
const { LoggerUtil } = require('helios-core')

const logger = LoggerUtil.getLogger('DiscordWrapper')

const { Client } = require('discord-rpc-patch')

const Lang = require('./langloader')

let client
let activity
let genSettings
let servSettings

exports.initRPC = function (gen, serv, initialDetails = Lang.queryJS('discord.waiting'), initialState = Lang.queryJS('discord.state', { shortId: serv.shortId })) {
    genSettings = gen
    servSettings = serv

    if (!initialDetails || initialDetails === '') initialDetails = 'Waiting...'
    if (!initialState || initialState === '') initialState = 'Idle'

    if (client) {
        activity.details = initialDetails
        activity.state = initialState
        client.setActivity(activity)
        return
    }

    client = new Client({ transport: 'ipc' })

    activity = {
        details: initialDetails,
        state: initialState,
        smallImageKey: servSettings.largeImageKey,
        smallImageText: servSettings.largeImageText,
        largeImageKey: genSettings.smallImageKey,
        largeImageText: genSettings.smallImageText,
        startTimestamp: new Date().getTime(),
        instance: false
    }

    client.on('ready', () => {
        logger.info('Discord RPC Connected')
        client.setActivity(activity)
    })

    const doLogin = () => {
        client.login({ clientId: genSettings.clientId }).catch(error => {
            if (error.message.includes('ENOENT') || error.message.includes('RPC_CONNECTION_TIMEOUT') || error.message.includes('Could not connect')) {
                logger.info('Unable to initialize Discord Rich Presence, no client detected. Retrying in 15s..')
                setTimeout(doLogin, 15000)
            } else {
                logger.info('Unable to initialize Discord Rich Presence: ' + error.message, error)
            }
        })
    }

    doLogin()
}

exports.updateDetails = function (details) {
    if (!client || !client.user) return
    activity.details = details
    client.setActivity(activity)
}

exports.updateActivity = function (newActivity) {
    if (!client || !client.user) return
    activity = { ...activity, ...newActivity }
    client.setActivity(activity)
}

exports.clearActivity = function () {
    if (!client || !client.user) return
    client.clearActivity()
}

exports.shutdownRPC = function () {
    if (!client) return
    client.clearActivity()
    client.destroy()
    client = null
    activity = null
}
