'use strict'
// Amics (connexió al relay des del launcher).
// Mòdul del procés principal d'Electron (abans tot era a index.js). Registra els seus handlers IPC en carregar-se.
const { ConfigManager, AuthManager, devLog, path, app, ipcMain } = require('./core')
const { RelayAuth } = require('./runtime')
const { skins } = require('./skins')
const { getWindow } = require('./window')



// ── Amics (docs/pendents/plans/11-social-f4.md) ───────────────────────────────────────────────
// Connexió al relay des del launcher, sense el joc obert. Només si l'usuari ho ha activat (`ui.social`, amb el seu consentiment al
// renderer), té els termes acceptats i el compte seleccionat és Microsoft. L'estat no es desa: es reenvia al renderer a cada canvi.
const { DEFAULT_RELAY_BASE } = require('../../app/assets/js/relayauth')
const socialSend = (channel, payload) => {
    try { if (getWindow() != null && !getWindow().isDestroyed()) getWindow().webContents.send(channel, payload) } catch { /* finestra tancant-se */ }
}
function socialAccount() {
    const account = ConfigManager.getSelectedAccount()
    return account != null && account.type === 'microsoft' ? account : null
}
function socialWanted() {
    return ConfigManager.getUiConfig().social === true && ConfigManager.getLegal().termsAcceptedVersion != null && socialAccount() != null
}
const SocialClient = require('../../app/assets/js/socialclient').create({
    authenticate: async () => {
        const account = socialAccount()
        if (account == null) return null
        // El token d'accés pot haver caducat: es refresca abans (mateixa via que la renovació durant la partida).
        if ((await AuthManager.validateAccountStatus(account.uuid)) !== 'ok') return null
        return RelayAuth.authenticate(ConfigManager.getAuthAccount(account.uuid))
    },
    wanted: socialWanted,
    url: `${(process.env.HELLMC_RELAY_URL || DEFAULT_RELAY_BASE).replace(/\/+$/, '').replace(/^http/, 'ws')}/ws`,
    WebSocketImpl: globalThis.WebSocket,
    onState: (state) => { socialSend('hellmc:social-state', state); FriendAvatars.sync(socialFaceUuids(state)) },
    // L'estat real és el del relay: Amics pot haver-se activat (o pausat) des del joc; el launcher ho segueix.
    onRemote: (enabled) => {
        const on = ConfigManager.getUiConfig().social === true
        if (enabled && !on) { ConfigManager.setUiConfig({ social: true }); ConfigManager.save() }
        else if (!enabled && on && !SocialClient.isEnabling()) { ConfigManager.setUiConfig({ social: false }); ConfigManager.save(); setTimeout(() => SocialClient.stop(), 0) }
    },
    onEvent: (event) => socialSend('hellmc:social-event', event),
    log: (msg) => devLog(msg)
})
// Sense consentiment local, només es connecta (uns segons) per saber si Amics s'ha activat des del joc; igual que el runtime, requereix el relay activat.
const socialCanProbe = () => ConfigManager.getUiConfig().relay !== false && ConfigManager.getLegal().termsAcceptedVersion != null && socialAccount() != null
// Skins dels amics: el launcher les baixa (amb caché de 24 h al disc) i les deixa a `<wardrobe>/avatars/<uuid>.png` perquè el menú del joc les mostri
// sense fer cap petició. Només es baixen les dels amics, sol·licituds rebudes i enviades (mai les dels bloquejats) i s'esborren les que ja no cal.
const FriendAvatars = require('../../app/assets/js/friendavatars').create({
    getSkin: (uuid) => skins.friendSkin(uuid),
    dir: path.join(app.getPath('userData'), 'wardrobe', 'avatars'),
    log: (msg) => devLog(msg)
})
const socialFaceUuids = (state) => (state.enabled ? [...state.friends, ...state.incoming, ...state.outgoing].map((p) => p.uuid) : [])
/** UUID que el relay ha donat a aquest compte (amics, sol·licituds, bloquejats): els únics dels quals el renderer pot demanar la skin. */
function socialKnownUuids() {
    const s = SocialClient.getState()
    return new Set([...s.friends, ...s.incoming, ...s.outgoing, ...s.blocked].map((p) => p.uuid))
}
let socialUuid = null
/** Arrenca, atura o reinicia la connexió segons l'ajust i el compte seleccionat. Mai llança. */
function socialSync() {
    try {
        const account = socialAccount()
        const uuid = account != null ? account.uuid : null
        if (SocialClient.isRunning() && uuid !== socialUuid) SocialClient.stop()
        socialUuid = uuid
        if (socialWanted()) SocialClient.start()
        else if (socialCanProbe()) SocialClient.start({ probe: true })
        else if (SocialClient.isRunning()) SocialClient.stop()
    } catch (err) {
        devLog(`social: ${err && err.message}`)
    }
}
const socialSnapshot = () => ({
    consent: ConfigManager.getUiConfig().social === true,
    available: socialAccount() != null,
    state: SocialClient.getState()
})
ipcMain.handle('hellmc:social-state', () => socialSnapshot())
ipcMain.handle('hellmc:social-enable', (_event, value) => {
    if (typeof value !== 'boolean') throw new Error('SOCIAL_ERROR:INVALID')
    if (value && socialAccount() == null) throw new Error('SOCIAL_ERROR:NO_MICROSOFT')
    ConfigManager.setUiConfig({ social: value })
    ConfigManager.save()
    if (value) {
        socialSync()
        SocialClient.enable()    // després de socialSync: aquest pot reiniciar la connexió i esborraria la petició
    } else {
        SocialClient.pause()
    }
    return socialSnapshot()
})
// El renderer ho demana en obrir la pestanya Amics: torna a mirar si s'ha activat des del joc (no fa res si ja hi ha connexió).
ipcMain.handle('hellmc:social-probe', () => { socialSync(); return socialSnapshot() })
ipcMain.handle('hellmc:social-act', async (_event, op, payload) => {
    const result = await SocialClient.act(op, payload)
    if (op === 'delete' && result === 'ok') {
        // Dades esborrades: Amics queda desactivat (si no, en reconnectar es tornaria a crear el perfil).
        ConfigManager.setUiConfig({ social: false })
        ConfigManager.save()
        SocialClient.stop()
    }
    return result
})
app.on('ready', () => { setTimeout(socialSync, 2000) })
// Un canvi de compte (afegir, treure o seleccionar) reinicia o atura la connexió d'Amics; i la skin d'un amic només es serveix si el relay l'ha donat.
require('./events').on('account-changed', socialSync)
require('./skins').setFriendUuidProvider(socialKnownUuids)

module.exports = {
    SocialClient,
    socialKnownUuids,
    socialSync
}
