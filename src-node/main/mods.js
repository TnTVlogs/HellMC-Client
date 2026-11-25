'use strict'
// Pestanya Mods (grups de dependències).
// Mòdul del procés principal d'Electron (abans tot era a index.js). Registra els seus handlers IPC en carregar-se.
const { Type, ipcMain, DistroAPI, ConfigManager, ProcessBuilder } = require('./core')



// ── 2.3: pestanya Mods (grups de dependències, `docs/mod-dependency-groups`) ────────────────────
// `ModGroups`/`enforceModDependencies` (`processbuilder.js`) ja funcionaven — implementats i provats
// a la sessió 2026-09-24, abans de començar Fase 2 — la UI antiga (`settings.js`) ja els fa servir i
// `ProcessBuilder.build()` ja crida `enforceModDependencies` a cada llançament (2.1 §6). Aquí només
// cal exposar el graf i l'estat via IPC perquè el renderer nou en pinti la seva pròpia UI (07 §4.2
// pt.2) — la lògica de grup (`renderer/src/utils/modgroups.ts`) és un port fidel del mateix
// `app/assets/js/modgroups.js`, no una reimplementació (veure nota de sincronització en aquell
// fitxer): és pura i sense dependències Node, però CommonJS/UMD aquí i ESM al renderer Vite, no hi
// ha una manera neta d'importar-la des de tots dos costats sense tocar el sistema de mòduls de tot
// el repo per una sola peça de 07 §4.2.
const MOD_TYPES = [Type.ForgeMod, Type.LiteMod, Type.LiteLoader, Type.FabricMod]
ipcMain.handle('hellmc:mods-list', async (_event, versionId) => {
    const distro = await DistroAPI.getDistribution()
    const version = distro.getVersionById(versionId)
    if (version == null) return []
    return version.modules
        .filter((m) => MOD_TYPES.includes(m.rawModule.type))
        .map((m) => ({
            id: m.rawModule.id,
            key: m.getVersionlessMavenIdentifier(),
            name: m.rawModule.name,
            required: !!m.getRequired().value,
            dependencies: m.rawModule.dependencies || []
        }))
})
ipcMain.handle('hellmc:mods-get-state', async (_event, versionId) => {
    const distro = await DistroAPI.getDistribution()
    const version = distro.getVersionById(versionId)
    if (version == null) return {}
    const mods = ConfigManager.getModConfiguration(versionId)?.mods ?? {}
    const state = {}
    for (const m of version.modules) {
        if (!MOD_TYPES.includes(m.rawModule.type)) continue
        // `ProcessBuilder.isModEnabled` és la mateixa funció que decideix què es carrega de veritat
        // al llançament — l'estat que la pestanya mostra ha de coincidir exactament, no un càlcul
        // propi que es pugui desincronitzar.
        state[m.getVersionlessMavenIdentifier()] = ProcessBuilder.isModEnabled(mods[m.getVersionlessMavenIdentifier()], m.getRequired())
    }
    return state
})
ipcMain.handle('hellmc:mods-set-state', async (_event, versionId, patch) => {
    // Mai reemplaça `mods` sencer: una entrada existent pot ser un objecte amb `mods` niats (un mod
    // amb `subModules`, 07 §4.2 no els representa aquí, però no s'han de perdre) — només se
    // n'actualitza `.value`, mateix criteri que `enforceModDependencies` (`processbuilder.js`).
    const mods = ConfigManager.getModConfiguration(versionId)?.mods ?? {}
    for (const [key, value] of Object.entries(patch)) {
        const cur = mods[key]
        mods[key] = cur != null && typeof cur === 'object' ? { ...cur, value } : value
    }
    ConfigManager.setModConfiguration(versionId, { id: versionId, mods })
    ConfigManager.save()
})

module.exports = {

}
