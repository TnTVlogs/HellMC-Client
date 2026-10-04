// Discord RPC «al menú» (P17, 06 §8.1): només mentre el launcher és obert i no hi ha cap partida;
// «en partida» ho gestiona el mòdul in-game (HellMC-Presence).
const { LoggerUtil } = require('hellmc-core')

const logger = LoggerUtil.getLogger('DiscordWrapper')

const { Client } = require('discord-rpc-patch')

let client
let activity
let genSettings
let servSettings
let retryTimer = null

// Les crides del client RPC retornen una promesa que rebutja (i llança de forma síncrona si no hi ha socket) quan Discord
// es tanca o encara no s'ha connectat: mai ha de quedar sense capturar (UnhandledPromiseRejection).
function safe(fn) {
    try {
        const result = fn()
        if (result && typeof result.catch === 'function') {
            result.catch(error => logger.debug('Discord RPC: ' + error.message))
        }
    } catch (error) {
        logger.debug('Discord RPC: ' + error.message)
    }
}

// Fase 0: `serv` is null when the launched version isn't tied to a `Server`
// (no catalog exists yet, see 01-terminologia-i-dades.md §3.3) — RPC then
// falls back to generic branding instead of a per-server shortId/state.
exports.initRPC = function (gen, serv, initialDetails = 'In the launcher', initialState = serv != null ? `Server: ${serv.shortId}` : 'HellMC') {
    genSettings = gen
    servSettings = serv || {}

    if (!initialDetails || initialDetails === '') initialDetails = 'Waiting...'
    if (!initialState || initialState === '') initialState = 'Idle'

    if (client) {
        activity.details = initialDetails
        activity.state = initialState
        // Sense connexió (Discord tancat, o encara reintentant) no hi ha socket: l'activitat es guarda i s'envia en `ready`.
        if (client.user) safe(() => client.setActivity(activity))
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
        safe(() => client.setActivity(activity))
    })

    // Reintents fins que Discord s'obri. El temporitzador es cancel·la a `shutdownRPC` i cada
    // intent comprova que el client segueixi sent aquest (si no, `client` ja és `null` → crash).
    const thisClient = client
    let warned = false
    const doLogin = () => {
        retryTimer = null
        if (client !== thisClient) return
        thisClient.login({ clientId: genSettings.clientId }).catch(error => {
            if (client !== thisClient) return
            if (error.message.includes('ENOENT') || error.message.includes('RPC_CONNECTION_TIMEOUT') || error.message.includes('Could not connect')) {
                if (!warned) {
                    warned = true
                    logger.info('Discord no detectat; es reintenta en silenci cada 30s.')
                }
                retryTimer = setTimeout(doLogin, 30000)
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
    safe(() => client.setActivity(activity))
}

exports.updateActivity = function (newActivity) {
    if (!client || !client.user) return
    activity = { ...activity, ...newActivity }
    safe(() => client.setActivity(activity))
}

exports.clearActivity = function () {
    if (!client || !client.user) return
    safe(() => client.clearActivity())
}

exports.shutdownRPC = function () {
    if (retryTimer != null) {
        clearTimeout(retryTimer)
        retryTimer = null
    }
    if (!client) return
    const old = client
    client = null
    activity = null
    // Pot no haver arribat a connectar mai: cap d'aquestes crides ha de poder petar.
    try { old.clearActivity() } catch { /* sense connexió */ }
    try { old.destroy() } catch { /* sense connexió */ }
}
