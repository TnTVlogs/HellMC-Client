'use strict'
// Armari: cosmètics i emotes (catàleg local i selecció).
// Mòdul del procés principal d'Electron (abans tot era a index.js). Registra els seus handlers IPC en carregar-se.
const { path, app, devLog, ipcMain } = require('./core')
const { selectedAccountKind } = require('./skins')



// ── Armari (docs/client-cosmetics/17-armari-i-seleccio.md) ───────────────────────────────────
// El launcher escriu `<userData>/wardrobe/equipped.json` i el catàleg local; el joc ho llegeix. Per compte (uuid).
const WardrobeManager = require('../../app/assets/js/wardrobemanager')
const wardrobe = WardrobeManager.create({ dir: path.join(app.getPath('userData'), 'wardrobe') })
// Catàleg del servidor (els administradors el gestionen al panell): es baixa en arrencar i abans de cada partida.
const CatalogSync = require('../../app/assets/js/catalogsync').create({ wardrobe, log: (msg) => devLog(msg) })

function wardrobeAccount() {
    const uuid = selectedAccountKind().uuid
    if (uuid == null) throw new WardrobeManager.WardrobeError('INVALID_ACCOUNT')
    return uuid
}

/** Les excepcions de `WardrobeManager` ja porten `WARDROBE_ERROR:<CODI>`; la resta s'amaguen sota un codi genèric. */
async function wardrobeGuard(fn) {
    try {
        return await fn()
    } catch (err) {
        if (err instanceof WardrobeManager.WardrobeError) throw err
        console.error('[wardrobe]', err)
        throw new WardrobeManager.WardrobeError('UNKNOWN')
    }
}

function wardrobeState() {
    return { catalog: wardrobe.catalog(), equipped: wardrobe.getEquipped(wardrobeAccount()) }
}

ipcMain.handle('hellmc:wardrobe-state', () => wardrobeGuard(async () => wardrobeState()))
ipcMain.handle('hellmc:wardrobe-sync', () => wardrobeGuard(async () => {
    await CatalogSync.sync()
    return wardrobeState()
}))
ipcMain.handle('hellmc:wardrobe-read-preview', (_event, id) => wardrobeGuard(async () => wardrobe.readPreview(id)))
ipcMain.handle('hellmc:wardrobe-save-preview', (_event, id, dataUrl) => wardrobeGuard(async () => {
    wardrobe.savePreview(id, dataUrl)
    return wardrobeState()
}))
ipcMain.handle('hellmc:wardrobe-read-item', (_event, id) => wardrobeGuard(async () => wardrobe.readItem(id)))
ipcMain.handle('hellmc:wardrobe-set-settings', (_event, patch) => wardrobeGuard(async () => {
    wardrobe.setSettings(wardrobeAccount(), patch)
    return wardrobeState()
}))
ipcMain.handle('hellmc:wardrobe-set-cosmetic', (_event, slot, id) => wardrobeGuard(async () => {
    wardrobe.setCosmetic(wardrobeAccount(), slot, id)
    return wardrobeState()
}))
ipcMain.handle('hellmc:wardrobe-set-emote', (_event, index, id) => wardrobeGuard(async () => {
    wardrobe.setEmote(wardrobeAccount(), index, id)
    return wardrobeState()
}))
ipcMain.handle('hellmc:wardrobe-remove', (_event, id) => wardrobeGuard(async () => {
    wardrobe.removeItem(id)
    return wardrobeState()
}))

module.exports = {
    CatalogSync
}
