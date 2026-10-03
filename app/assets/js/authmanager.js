/**
 * AuthManager
 * 
 * This module aims to abstract login procedures. Results from Mojang's REST api
 * are retrieved through our Mojang module. These results are processed and stored,
 * if applicable, in the config using the ConfigManager. All login procedures should
 * be made through this module.
 * 
 * @module authmanager
 */
// Requirements
const ConfigManager = require('./configmanager')
const { LoggerUtil } = require('hellmc-core')
const { RestResponseStatus } = require('hellmc-core/common')
const { MicrosoftAuth, MicrosoftErrorCode } = require('hellmc-core/microsoft')
const { AZURE_CLIENT_ID } = require('./ipcconstants')

const crypto = require('crypto')

const log = LoggerUtil.getLogger('AuthManager')

// Errors: es rebutja amb `{ code, network }` (`code` = nom de `MicrosoftErrorCode`, p. ex.
// 'NO_PROFILE'); el text traduït el posa la UI (`renderer/src/i18n`, `auth.error.<code>`).

function microsoftError(errorCode) {
    return { code: MicrosoftErrorCode[errorCode] ?? 'UNKNOWN' }
}

// Functions

/**
 * Add a Mojang account. This will authenticate the given credentials with Mojang's
 * authserver. The resultant data will be stored as an auth account in the
 * configuration database.
 * 
 * @param {string} username The account username (email if migrated).
 * @param {string} password The account password.
 * @returns {Promise.<Object>} Promise which resolves the resolved authenticated account object.
 */
exports.addMojangAccount = async function (username) {
    try {
        let userId = null
        // Gerar um UUID baseado no hash MD5 do nome de usuário
        const hash = crypto.createHash('md5')
        hash.update(username)
        userId = hash.digest('hex')

        const ret = ConfigManager.addMojangAuthAccount(userId, 'sry', username, username)
        if (ConfigManager.getClientToken() == null) {
            ConfigManager.setClientToken('sry')
        }

        ConfigManager.save()
        return ret

    } catch (err) {
        log.error(err)
        return Promise.reject(err)
    }
}

const AUTH_MODE = { FULL: 0, MS_REFRESH: 1, MC_REFRESH: 2 }

/**
 * True if the error means "no answer from the server" (offline, DNS, timeout...) as opposed to
 * the server answering with a refusal (HTTP 4xx, invalid_grant...). Only the latter means the
 * stored credentials are really invalid (07 §7.3).
 */
function isNetworkError(error) {
    if (error == null) return false
    if (error.response != null) return false // got an HTTP answer
    const networkCodes = ['ENOTFOUND', 'EAI_AGAIN', 'ETIMEDOUT', 'ECONNREFUSED', 'ECONNRESET', 'ENETUNREACH', 'EHOSTUNREACH']
    return error.name === 'RequestError' || error.name === 'TimeoutError'
        || networkCodes.includes(error.code) || /fetch failed/i.test(error.message ?? '')
}

function rejectMicrosoft(errorCode, response) {
    return Promise.reject({ ...microsoftError(errorCode), network: isNetworkError(response?.error) })
}

/**
 * Perform the full MS Auth flow in a given mode.
 * 
 * AUTH_MODE.FULL = Full authorization for a new account.
 * AUTH_MODE.MS_REFRESH = Full refresh authorization.
 * AUTH_MODE.MC_REFRESH = Refresh of the MC token, reusing the MS token.
 * 
 * @param {string} entryCode FULL-AuthCode. MS_REFRESH=refreshToken, MC_REFRESH=accessToken
 * @param {*} authMode The auth mode.
 * @returns An object with all auth data. AccessToken object will be null when mode is MC_REFRESH.
 */
async function fullMicrosoftAuthFlow(entryCode, authMode) {
    try {

        let accessTokenRaw
        let accessToken
        if (authMode !== AUTH_MODE.MC_REFRESH) {
            const accessTokenResponse = await MicrosoftAuth.getAccessToken(entryCode, authMode === AUTH_MODE.MS_REFRESH, AZURE_CLIENT_ID)
            if (accessTokenResponse.responseStatus === RestResponseStatus.ERROR) {
                return rejectMicrosoft(accessTokenResponse.microsoftErrorCode, accessTokenResponse)
            }
            accessToken = accessTokenResponse.data
            accessTokenRaw = accessToken.access_token
        } else {
            accessTokenRaw = entryCode
        }

        const xblResponse = await MicrosoftAuth.getXBLToken(accessTokenRaw)
        if (xblResponse.responseStatus === RestResponseStatus.ERROR) {
            return rejectMicrosoft(xblResponse.microsoftErrorCode, xblResponse)
        }
        const xstsResonse = await MicrosoftAuth.getXSTSToken(xblResponse.data)
        if (xstsResonse.responseStatus === RestResponseStatus.ERROR) {
            return rejectMicrosoft(xstsResonse.microsoftErrorCode, xstsResonse)
        }
        const mcTokenResponse = await MicrosoftAuth.getMCAccessToken(xstsResonse.data)
        if (mcTokenResponse.responseStatus === RestResponseStatus.ERROR) {
            return rejectMicrosoft(mcTokenResponse.microsoftErrorCode, mcTokenResponse)
        }
        const mcProfileResponse = await MicrosoftAuth.getMCProfile(mcTokenResponse.data.access_token)
        if (mcProfileResponse.responseStatus === RestResponseStatus.ERROR) {
            return rejectMicrosoft(mcProfileResponse.microsoftErrorCode, mcProfileResponse)
        }
        return {
            accessToken,
            accessTokenRaw,
            xbl: xblResponse.data,
            xsts: xstsResonse.data,
            mcToken: mcTokenResponse.data,
            mcProfile: mcProfileResponse.data
        }
    } catch (err) {
        log.error(err)
        return Promise.reject({ ...microsoftError(MicrosoftErrorCode.UNKNOWN), network: isNetworkError(err) })
    }
}

/**
 * Calculate the expiry date. Advance the expiry time by 10 seconds
 * to reduce the liklihood of working with an expired token.
 * 
 * @param {number} nowMs Current time milliseconds.
 * @param {number} epiresInS Expires in (seconds)
 * @returns 
 */
function calculateExpiryDate(nowMs, epiresInS) {
    if (epiresInS == null) {
        return null
    }
    return nowMs + ((epiresInS - 10) * 1000)
}


/**
 * Add a Microsoft account. This will pass the provided auth code to Mojang's OAuth2.0 flow.
 * The resultant data will be stored as an auth account in the configuration database.
 * 
 * @param {string} authCode The authCode obtained from microsoft.
 * @returns {Promise.<Object>} Promise which resolves the resolved authenticated account object.
 */
exports.addMicrosoftAccount = async function (authCode) {

    const fullAuth = await fullMicrosoftAuthFlow(authCode, AUTH_MODE.FULL)

    // Advance expiry by 10 seconds to avoid close calls.
    const now = new Date().getTime()

    const ret = ConfigManager.addMicrosoftAuthAccount(
        fullAuth.mcProfile.id,
        fullAuth.mcToken.access_token,
        fullAuth.mcProfile.name,
        calculateExpiryDate(now, fullAuth.mcToken.expires_in),
        fullAuth.accessToken.access_token,
        fullAuth.accessToken.refresh_token,
        calculateExpiryDate(now, fullAuth.accessToken.expires_in)
    )
    ConfigManager.save()

    return ret
}

/**
 * Remove a Mojang account. This will invalidate the access token associated
 * with the account and then remove it from the database.
 * 
 * @param {string} uuid The UUID of the account to be removed.
 * @returns {Promise.<void>} Promise which resolves to void when the action is complete.
 */
exports.removeMojangAccount = async function (uuid) {
    try {
        ConfigManager.removeAuthAccount(uuid)
        ConfigManager.save()
        return Promise.resolve()
    } catch (err) {
        log.error('Error while removing account', err)
        return Promise.reject(err)
    }
}

/**
 * Remove a Microsoft account. It is expected that the caller will invoke the OAuth logout
 * through the ipc renderer.
 * 
 * @param {string} uuid The UUID of the account to be removed.
 * @returns {Promise.<void>} Promise which resolves to void when the action is complete.
 */
exports.removeMicrosoftAccount = async function (uuid) {
    try {
        ConfigManager.removeAuthAccount(uuid)
        ConfigManager.save()
        return Promise.resolve()
    } catch (err) {
        log.error('Error while removing account', err)
        return Promise.reject(err)
    }
}

/**
 * Offline accounts (stored as type 'mojang', 09 P1/07 §7.4) have no real session: never validated
 * against Mojang, never need network.
 *
 * @returns {Promise.<'ok'>}
 */
async function validateSelectedOfflineAccount() {
    log.info('Offline account, nothing to validate.')
    return 'ok'
}

/**
 * Validate the selected account with Microsoft's authserver. If the account is not valid,
 * we will attempt to refresh the access token and update that value. If that fails, a
 * new login will be required.
 * 
 * @returns {Promise.<'ok'|'offline'|'invalid'>} 'offline' = could not reach the servers
 * (never delete the account); 'invalid' = the servers refused the credentials.
 */
async function validateSelectedMicrosoftAccount() {
    const current = ConfigManager.getSelectedAccount()
    const now = new Date().getTime()

    // Proactive refresh: check if token expires within 30 minutes.
    const mcExpiresAt = current.expiresAt
    const mcExpired = (mcExpiresAt == null || isNaN(mcExpiresAt) || now >= (mcExpiresAt - (30 * 60 * 1000)))

    if (!mcExpired) {
        log.info('MC Token is still valid (safety margin included).')
        return 'ok'
    }

    log.info('MC Token is expired or near expiry. Attempting to refresh.')

    // MC token expired. Check MS token.
    const msExpiresAt = current.microsoft.expires_at
    const msExpired = (msExpiresAt == null || isNaN(msExpiresAt) || now >= (msExpiresAt - (30 * 60 * 1000)))

    if (msExpired) {
        log.info('MS Token is expired or near expiry. Attempting full refresh (MS_REFRESH).')
        // MS expired, do full refresh.
        if (!current.microsoft.refresh_token) {
            log.warn('Refresh token is missing, cannot refresh Microsoft account.')
            return 'invalid'
        }
        try {
            const res = await fullMicrosoftAuthFlow(current.microsoft.refresh_token, AUTH_MODE.MS_REFRESH)

            ConfigManager.updateMicrosoftAuthAccount(
                current.uuid,
                res.mcToken.access_token,
                res.accessToken.access_token,
                res.accessToken.refresh_token,
                calculateExpiryDate(now, res.accessToken.expires_in),
                calculateExpiryDate(now, res.mcToken.expires_in)
            )
            ConfigManager.save()
            log.info('Successfully refreshed Microsoft and Minecraft tokens.')
            return 'ok'
        } catch (_err) {
            log.error('Error during MS_REFRESH:', _err)
            return _err?.network ? 'offline' : 'invalid'
        }
    } else {
        // Only MC expired, use existing MS token.
        log.info('MS Token is still valid. Attempting Minecraft token refresh (MC_REFRESH).')
        try {
            const res = await fullMicrosoftAuthFlow(current.microsoft.access_token, AUTH_MODE.MC_REFRESH)

            ConfigManager.updateMicrosoftAuthAccount(
                current.uuid,
                res.mcToken.access_token,
                current.microsoft.access_token,
                current.microsoft.refresh_token,
                current.microsoft.expires_at,
                calculateExpiryDate(now, res.mcToken.expires_in)
            )
            ConfigManager.save()
            log.info('Successfully refreshed Minecraft token.')
            return 'ok'
        }
        catch (_err) {
            log.warn('Failed to refresh Minecraft token with current MS token. Falling back to full refresh.', _err)
            // Fallback: If MC_REFRESH fails, try MS_REFRESH.
            if (!current.microsoft.refresh_token) {
                log.warn('Refresh token is missing, cannot perform fallback refresh.')
                return 'invalid'
            }
            try {
                log.info('Attempting fallback full refresh (MS_REFRESH).')
                const res = await fullMicrosoftAuthFlow(current.microsoft.refresh_token, AUTH_MODE.MS_REFRESH)

                ConfigManager.updateMicrosoftAuthAccount(
                    current.uuid,
                    res.mcToken.access_token,
                    res.accessToken.access_token,
                    res.accessToken.refresh_token,
                    calculateExpiryDate(now, res.accessToken.expires_in),
                    calculateExpiryDate(now, res.mcToken.expires_in)
                )
                ConfigManager.save()
                log.info('Successfully refreshed tokens via fallback MS_REFRESH.')
                return 'ok'
            } catch (err2) {
                log.error('Fallback MS_REFRESH also failed:', err2)
                return err2?.network ? 'offline' : 'invalid'
            }
        }
    }
}


/**
 * Validate the selected auth account (07 §7.3).
 *
 * @returns {Promise.<'ok'|'offline'|'invalid'>} 'offline' never means the account must be removed.
 */
exports.validateSelectedStatus = async function () {
    const current = ConfigManager.getSelectedAccount()

    if (current.type === 'microsoft') {
        return await validateSelectedMicrosoftAccount()
    } else {
        return await validateSelectedOfflineAccount()
    }
}

/**
 * Backwards-compatible boolean form (old UI deletes the account on false): false only when the
 * credentials are really invalid, never because of missing network.
 *
 * @returns {Promise.<boolean>}
 */
exports.validateSelected = async function () {
    return (await exports.validateSelectedStatus()) !== 'invalid'
}
