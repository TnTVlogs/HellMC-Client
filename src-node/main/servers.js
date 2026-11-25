'use strict'
// Ping de servidors.
// Mòdul del procés principal d'Electron (abans tot era a index.js). Registra els seus handlers IPC en carregar-se.
const { ipcMain, parseAddress, pingJavaServer } = require('./core')



// ── 2.2: ping de servidors (real, socket directe) ─────────────────────────────────────────────
ipcMain.handle('hellmc:status-ping', async (_event, address) => {
    if (typeof address !== 'string' || address.length === 0 || address.length > 255) return { online: false }
    const parsed = parseAddress(address, 25565)
    if (parsed == null) {
        return { online: false }
    }
    try {
        const result = await pingJavaServer(parsed.host, parsed.port, { timeout: 3000 })
        return {
            online: true,
            players: { online: result.players.online, max: result.players.max },
            latencyMs: result.roundTripLatency
        }
    } catch {
        return { online: false }
    }
})

module.exports = {

}
