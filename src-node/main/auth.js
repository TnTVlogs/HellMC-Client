'use strict'
// Comptes i inici de sessió de Microsoft (finestres d'OAuth).
// Mòdul del procés principal d'Electron (abans tot era a index.js). Registra els seus handlers IPC en carregar-se.
const { ipcMain, MSFT_OPCODE, MSFT_REPLY_TYPE, MSFT_ERROR, BrowserWindow, AZURE_CLIENT_ID, ConfigManager, Security, AuthManager } = require('./core')
const { getPlatformIcon } = require('./window')
const events = require('./events')




const REDIRECT_URI = 'https://login.microsoftonline.com/common/oauth2/nativeclient'

// Microsoft Auth Login
let msftAuthWindow
let msftAuthSuccess
let msftAuthViewSuccess
let msftAuthViewOnClose
// S8: PKCE (RFC 7636) + `state` aleatori + sessió **efímera** (cap galeta de Microsoft persistent al launcher).
let pendingMsftLogin = null // { state, verifier }
function base64Url(buffer) {
    return buffer.toString('base64url')
}
ipcMain.on(MSFT_OPCODE.OPEN_LOGIN, (ipcEvent, ...arguments_) => {
    if (msftAuthWindow) {
        ipcEvent.reply(MSFT_OPCODE.REPLY_LOGIN, MSFT_REPLY_TYPE.ERROR, MSFT_ERROR.ALREADY_OPEN, msftAuthViewOnClose)
        return
    }
    msftAuthSuccess = false
    msftAuthViewSuccess = arguments_[0]
    msftAuthViewOnClose = arguments_[1]
    const crypto = require('crypto')
    const verifier = base64Url(crypto.randomBytes(32))
    pendingMsftLogin = { state: base64Url(crypto.randomBytes(16)), verifier }
    msftAuthWindow = new BrowserWindow({
        title: 'Microsoft',
        backgroundColor: '#222222',
        width: 520,
        height: 600,
        frame: true,
        icon: getPlatformIcon('SealCircle'),
        webPreferences: {
            // Partició sense `persist:` = sessió en memòria: es descarta en tancar la finestra.
            partition: `ms-login-${Date.now()}`,
            sandbox: true,
            contextIsolation: true,
            nodeIntegration: false
        }
    })

    msftAuthWindow.on('closed', () => {
        msftAuthWindow = undefined
    })

    msftAuthWindow.on('close', () => {
        if (!msftAuthSuccess) {
            ipcEvent.reply(MSFT_OPCODE.REPLY_LOGIN, MSFT_REPLY_TYPE.ERROR, MSFT_ERROR.NOT_FINISHED, msftAuthViewOnClose)
        }
    })

    msftAuthWindow.webContents.on('did-navigate', (_, uri) => {
        if (uri.startsWith(REDIRECT_URI)) {
            const url = new URL(uri)
            const code = url.searchParams.get('code')
            if (code && url.searchParams.get('state') !== pendingMsftLogin?.state) {
                // La resposta no correspon a aquest intent (CSRF/«login CSRF»): es descarta.
                console.warn('[main] Microsoft login: state mismatch, ignoring response')
                return
            }
            if (code) {
                const queryMap = Object.fromEntries(url.searchParams.entries())

                ipcEvent.reply(MSFT_OPCODE.REPLY_LOGIN, MSFT_REPLY_TYPE.SUCCESS, queryMap, msftAuthViewSuccess)

                msftAuthSuccess = true
                msftAuthWindow.close()
                msftAuthWindow = null
            }
        }
    })

    msftAuthWindow.removeMenu()
    msftAuthWindow.loadURL(`https://login.microsoftonline.com/consumers/oauth2/v2.0/authorize?prompt=select_account&client_id=${AZURE_CLIENT_ID}&response_type=code&scope=XboxLive.signin%20offline_access&redirect_uri=${REDIRECT_URI}&state=${pendingMsftLogin.state}&code_challenge=${base64Url(crypto.createHash('sha256').update(verifier).digest())}&code_challenge_method=S256`)
})

// Microsoft Auth Logout
let msftLogoutWindow
let msftLogoutSuccess
let msftLogoutSuccessSent
ipcMain.on(MSFT_OPCODE.OPEN_LOGOUT, (ipcEvent, uuid, isLastAccount) => {
    if (msftLogoutWindow) {
        ipcEvent.reply(MSFT_OPCODE.REPLY_LOGOUT, MSFT_REPLY_TYPE.ERROR, MSFT_ERROR.ALREADY_OPEN)
        return
    }

    msftLogoutSuccess = false
    msftLogoutSuccessSent = false
    msftLogoutWindow = new BrowserWindow({
        title: 'Microsoft',
        backgroundColor: '#222222',
        width: 520,
        height: 600,
        frame: true,
        icon: getPlatformIcon('SealCircle')
    })

    msftLogoutWindow.on('closed', () => {
        msftLogoutWindow = undefined
    })

    msftLogoutWindow.on('close', () => {
        if (!msftLogoutSuccess) {
            ipcEvent.reply(MSFT_OPCODE.REPLY_LOGOUT, MSFT_REPLY_TYPE.ERROR, MSFT_ERROR.NOT_FINISHED)
        } else if (!msftLogoutSuccessSent) {
            msftLogoutSuccessSent = true
            ipcEvent.reply(MSFT_OPCODE.REPLY_LOGOUT, MSFT_REPLY_TYPE.SUCCESS, uuid, isLastAccount)
        }
    })

    msftLogoutWindow.webContents.on('did-navigate', (_, uri) => {
        if (uri.startsWith('https://login.microsoftonline.com/common/oauth2/v2.0/logoutsession')) {
            msftLogoutSuccess = true
            setTimeout(() => {
                if (!msftLogoutSuccessSent) {
                    msftLogoutSuccessSent = true
                    ipcEvent.reply(MSFT_OPCODE.REPLY_LOGOUT, MSFT_REPLY_TYPE.SUCCESS, uuid, isLastAccount)
                }

                if (msftLogoutWindow) {
                    msftLogoutWindow.close()
                    msftLogoutWindow = null
                }
            }, 5000)
        }
    })

    msftLogoutWindow.removeMenu()
    msftLogoutWindow.loadURL('https://login.microsoftonline.com/common/oauth2/v2.0/logout')
})

// ── 2.1: comptes (real; només el camí "offline" — Microsoft OAuth és fora d'abast d'aquesta
// sessió, veure `11-progres-fase2.md` §6 — `auth.addMicrosoft` es queda com a mock que rebutja) ──
function normalizeAccount(raw) {
    if (raw == null) return null
    // `configmanager.js` desa el compte sense contrasenya com a `type: 'mojang'` (nom històric
    // d'Helios) — `renderer/src/api.ts` només coneix `'microsoft' | 'offline'`.
    return {
        type: raw.type === 'microsoft' ? 'microsoft' : 'offline',
        uuid: raw.uuid,
        displayName: raw.displayName
    }
}
ipcMain.handle('hellmc:auth-accounts', () => {
    const all = Object.values(ConfigManager.getAuthAccounts()).map(normalizeAccount)
    const selected = ConfigManager.getSelectedAccount()
    return { accounts: all, selectedUuid: selected != null ? selected.uuid : null }
})
ipcMain.handle('hellmc:auth-select', (_event, uuid) => {
    ConfigManager.setSelectedAccount(uuid)
    ConfigManager.save()
    events.emit('account-changed')
})
ipcMain.handle('hellmc:auth-add-offline', async (_event, username) => {
    if (!Security.isValidOfflineName(username)) throw new Error('INVALID_USERNAME')
    const account = await AuthManager.addMojangAccount(username)
    return normalizeAccount(account)
})
// 2.5 (Compte > Microsoft, últim tros pendent des de 2.1 §6): el preload nou obre la mateixa
// finestra d'OAuth que l'app antiga (`MSFT_OPCODE.OPEN_LOGIN`/`REPLY_LOGIN`, dalt — mai tocada,
// cap canal nou al main) i, un cop té el `code`, només calia aquest handler per acabar
// l'intercanvi — `AuthManager.addMicrosoftAccount` és exactament la mateixa funció que crida
// la UI.
ipcMain.handle('hellmc:auth-add-microsoft', async (_event, code) => {
    try {
        const verifier = pendingMsftLogin?.verifier
        pendingMsftLogin = null
        const account = await AuthManager.addMicrosoftAccount(code, verifier)
        events.emit('account-changed')
        return normalizeAccount(account)
    } catch (err) {
        // `AuthManager` rebutja amb `{code, network}` (no un `Error`): per IPC arribaria com
        // «[object Object]». Es converteix en `MS_ERROR:<CODI>`, que la UI tradueix (07 §8.3).
        if (err != null && typeof err === 'object' && !(err instanceof Error) && err.code != null) {
            throw new Error(`MS_ERROR:${err.code}`)
        }
        throw err
    }
})
ipcMain.handle('hellmc:auth-remove', async (_event, uuid) => {
    const current = ConfigManager.getAuthAccounts()[uuid]
    if (current == null) return
    if (current.type === 'microsoft') {
        await AuthManager.removeMicrosoftAccount(uuid)
    } else {
        await AuthManager.removeMojangAccount(uuid)
    }
    events.emit('account-changed')
})
ipcMain.handle('hellmc:auth-validate', async () => {
    if (ConfigManager.getSelectedAccount() == null) return { status: 'invalid' }
    try {
        // 'offline' (sense xarxa) mai és 'invalid': el compte no s'ha d'esborrar (07 §7.3).
        return { status: await AuthManager.validateSelectedStatus() }
    } catch {
        return { status: 'invalid' }
    }
})

module.exports = {

}
