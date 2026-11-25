'use strict'
// HellMC Runtime, relay i renovació del token de Minecraft durant la partida.
// Mòdul del procés principal d'Electron (abans tot era a index.js). Registra els seus handlers IPC en carregar-se.
const { app, path, devLog, ConfigManager, AuthManager } = require('./core')
const { ROOT } = require('./core')



// ── HellMC Runtime (docs/client-cosmetics/09 i 19) ─────────────────────────────────────────────
// HellMC Runtime: el baixa la distribució a `<instància>/hellmc-runtime/`; en desenvolupament, `runtime/` a l'arrel (HellMC-Runtime `build.sh --install-client`).
const RuntimeManager = require('../../app/assets/js/runtimemanager')
const runtime = RuntimeManager.create({
    devRuntimeDir: app.isPackaged ? null : path.join(ROOT, 'runtime'),
    dataDir: app.getPath('userData'),
    clientVersion: app.getVersion()
})

// ── Relay de HellMC (docs/pendents/plans/09-relay-i-auth.md) ──────────────────────────────────
// Abans de cada partida s'autentica amb el relay i s'escriu `<instància>/hellmc-relay.json` perquè el runtime el trobi.
// Només comptes Microsoft, amb el relay activat (per defecte) i els termes acceptats; si no, s'esborra qualsevol sessió antiga.
// Mai bloqueja ni fa fallar el llançament.
const RelayAuth = require('../../app/assets/js/relayauth').create({
    fetchFn: (...args) => fetch(...args),
    dataDir: app.getPath('userData'),
    relayBase: process.env.HELLMC_RELAY_URL || undefined,
    log: (msg) => devLog(msg)
})
async function prepareRelay(gameDir) {
    try {
        const account = ConfigManager.getSelectedAccount()
        const enabled = ConfigManager.getUiConfig().relay !== false && ConfigManager.getLegal().termsAcceptedVersion != null
        if (!enabled || account == null || account.type !== 'microsoft') {
            RelayAuth.clear(gameDir)
            return false
        }
        // Tot el procés (3 peticions) com a molt 8 s: un relay lent no pot endarrerir el joc; sense sessió, sense relay.
        let timer
        const cap = new Promise((resolve) => { timer = setTimeout(() => resolve(false), 8000) })
        try {
            const ok = await Promise.race([RelayAuth.prepare(gameDir, account), cap])
            if (!ok) RelayAuth.clear(gameDir)
            return ok
        } finally {
            clearTimeout(timer)
        }
    } catch (err) {
        devLog(`relay: ${err && err.message}`)
        return false
    }
}

// ── Autorenovació del token de Minecraft durant la partida (docs/pendents/plans/10-autorenovacio-de-tokens.md) ──
// Mentre el joc és obert, el launcher refresca el compte d'AQUELLA partida i deixa el token nou a `<instància>/hellmc-session.json`;
// l'agent del joc (`-Dhellmc.session`) el posa al lloc. Si el launcher es tanca en iniciar el joc (`onGameStart = 'close'`) no hi ha renovació.
const SessionRenew = require('../../app/assets/js/sessionrenew').create({
    refresh: (uuid) => AuthManager.validateAccountStatus(uuid),
    getAccount: (uuid) => ConfigManager.getAuthAccount(uuid),
    log: (msg) => devLog(msg)
})

module.exports = {
    RelayAuth,
    RuntimeManager,
    SessionRenew,
    prepareRelay,
    runtime
}
