'use strict'
// Distribució (servidors i versions) i selecció recordada.
// Mòdul del procés principal d'Electron (abans tot era a index.js). Registra els seus handlers IPC en carregar-se.
const { ipcMain, DistroAPI, ConfigManager, assertId } = require('./core')
const { useDistroDiscordSettings } = require('./presence')



// ── 2.1: distribució (real, `DistroAPI`) ─────────────────────────────────────────────────────
ipcMain.handle('hellmc:distro-get', async () => {
    const distro = await DistroAPI.getDistribution()
    useDistroDiscordSettings(distro.rawDistribution)
    return distro.rawDistribution
})
ipcMain.handle('hellmc:distro-refresh', async () => {
    // `refreshDistributionOrFallback` no llança mai (cau a la que ja hi ha en memòria si la xarxa
    // falla) — no tenim manera senzilla de saber des d'aquí si ha vingut de xarxa o de fallback
    // sense entrar a l'intern d'`hellmc-core`, així que `fromCache` és una simplificació coneguda.
    const distro = await DistroAPI.refreshDistributionOrFallback()
    return { distribution: distro.rawDistribution, fromCache: false }
})

// ── 2.1: selecció recordada (real, mateixos getters/setters que `configmanager.js`) ──────────
ipcMain.handle('hellmc:selection-get', () => ({
    serverId: ConfigManager.getSelectedServer(),
    versionId: ConfigManager.getSelectedVersion()
}))
ipcMain.handle('hellmc:selection-set-version', (_event, versionId) => {
    assertId(versionId, { nullable: true })
    ConfigManager.setSelectedVersion(versionId)
    ConfigManager.save()
})
ipcMain.handle('hellmc:selection-set-server', (_event, serverId) => {
    assertId(serverId, { nullable: true })
    ConfigManager.setSelectedServer(serverId)
    ConfigManager.save()
})
ipcMain.handle('hellmc:selection-get-last-version-for-server', (_event, serverId) => {
    assertId(serverId)
    return ConfigManager.getLastVersionByServer(serverId)
})
ipcMain.handle('hellmc:selection-set-last-version-for-server', (_event, serverId, versionId) => {
    assertId(serverId)
    assertId(versionId)
    ConfigManager.setLastVersionByServer(serverId, versionId)
    ConfigManager.save()
})

module.exports = {

}
