'use strict'
// Skins i capes (biblioteca local i Mojang).
// Mòdul del procés principal d'Electron (abans tot era a index.js). Registra els seus handlers IPC en carregar-se.
const { ConfigManager, AuthManager, path, app, ipcMain, BrowserWindow, dialog, fs } = require('./core')



// ── Skins i capes (docs/client-cosmetics/14-skins.md) ─────────────────────────────────────────
// Comptes Microsoft: canvi real via l'API oficial de Minecraft Services. Comptes offline: només
// biblioteca i selecció LOCALS (mai es puja res). El token de Minecraft no surt d'aquest procés.
const SkinsManager = require('../../app/assets/js/skinsmanager')
const MAX_SKIN_FILE_BYTES = 1024 * 1024

async function getSkinsToken() {
    const selected = ConfigManager.getSelectedAccount()
    if (selected == null || selected.type !== 'microsoft') return null
    const status = await AuthManager.validateSelectedStatus()
    if (status === 'invalid') return null
    const current = ConfigManager.getSelectedAccount()
    return current != null && typeof current.accessToken === 'string' ? current.accessToken : null
}
const skins = SkinsManager.create({
    fetchFn: (...args) => fetch(...args),
    getToken: getSkinsToken,
    libraryDir: path.join(app.getPath('userData'), 'skins')
})

function selectedAccountKind() {
    const selected = ConfigManager.getSelectedAccount()
    return { uuid: selected != null ? selected.uuid : null, microsoft: selected != null && selected.type === 'microsoft' }
}

/** Les excepcions de `SkinsManager` ja porten `SKINS_ERROR:<CODI>`; la resta s'amaguen sota un codi genèric. */
async function skinsGuard(fn) {
    try {
        return await fn()
    } catch (err) {
        if (err instanceof SkinsManager.SkinsError) throw err
        console.error('[skins]', err)
        throw new SkinsManager.SkinsError('UNKNOWN')
    }
}

async function withTextures(profile) {
    // La skin activa es recorda com a «última skin» del compte i, sense Mojang ni caché, es demana a una API pública.
    const load = async (url, accountUuid) => {
        try {
            return (await skins.fetchTexture(url, { accountUuid })).dataUrl
        } catch {
            return null
        }
    }
    return {
        uuid: profile.uuid,
        name: profile.name,
        stale: profile.stale === true,
        skins: await Promise.all(profile.skins.map(async (s) => ({ ...s, image: await load(s.url, s.active ? profile.uuid : undefined) }))),
        capes: await Promise.all(profile.capes.map(async (c) => ({ ...c, image: await load(c.url) })))
    }
}
function libraryWithImages() {
    const { skins: list, selection } = skins.listLibrary()
    return {
        skins: list.map((s) => ({ ...s, image: skins.readLibraryPng(s.id).dataUrl })),
        selection
    }
}

ipcMain.handle('hellmc:skins-library', () => skinsGuard(async () => libraryWithImages()))
ipcMain.handle('hellmc:skins-profile', () => skinsGuard(async () => {
    if (!selectedAccountKind().microsoft) return null
    return await withTextures(await skins.getProfile(selectedAccountKind().uuid))
}))
// Skin que representa un compte (per al cap de l'avatar): offline → la seleccionada en local; Microsoft → la real,
// la darrera vista o una API pública. PNG com a data URL, o null (el renderer mostra Steve).
ipcMain.handle('hellmc:skins-avatar', (_event, uuid) => skinsGuard(async () => {
    // Un amic (conegut pel relay, mai un UUID qualsevol): la seva skin pública, amb caché al disc.
    if (typeof uuid === 'string' && ConfigManager.getAuthAccount(uuid) == null && knownFriendUuids().has(uuid)) {
        const buffer = await skins.friendSkin(uuid)
        return buffer != null ? `data:image/png;base64,${buffer.toString('base64')}` : null
    }
    const account = typeof uuid === 'string' ? ConfigManager.getAuthAccount(uuid) : null
    if (account == null || account.uuid !== uuid) return null
    if (account.type !== 'microsoft') {
        const { skins: list, selection } = skins.listLibrary()
        const picked = list.find((s) => s.id === selection[account.uuid])
        return picked != null ? skins.readLibraryPng(picked.id).dataUrl : null
    }
    const buffer = await skins.accountSkin(account.uuid, { live: selectedAccountKind().uuid === account.uuid })
    return buffer != null ? `data:image/png;base64,${buffer.toString('base64')}` : null
}))
ipcMain.handle('hellmc:skins-add-file', (event) => skinsGuard(async () => {
    const senderWin = BrowserWindow.fromWebContents(event.sender)
    const result = await dialog.showOpenDialog(senderWin, { properties: ['openFile'], filters: [{ name: 'PNG', extensions: ['png'] }] })
    if (result.canceled || result.filePaths.length === 0) return null
    const file = result.filePaths[0]
    const stat = fs.statSync(file)
    if (!stat.isFile() || stat.size > MAX_SKIN_FILE_BYTES) throw new SkinsManager.SkinsError('INVALID_PNG')
    // La variant (classic/slim) no es pot deduir del PNG: per defecte classic, es pot canviar a la vista abans d'aplicar.
    return skins.addToLibrary({ name: path.basename(file, path.extname(file)), variant: 'classic', png: fs.readFileSync(file), source: 'file' })
}))
ipcMain.handle('hellmc:skins-import-name', (_event, name) => skinsGuard(async () => {
    const found = await skins.lookupByName(name)
    const texture = await skins.fetchTexture(found.skinUrl)
    return skins.addToLibrary({ name: found.name, variant: found.variant, png: texture.buffer, source: 'name' })
}))
ipcMain.handle('hellmc:skins-import-current', () => skinsGuard(async () => {
    if (!selectedAccountKind().microsoft) throw new SkinsManager.SkinsError('NOT_MICROSOFT')
    const profile = await skins.getProfile(selectedAccountKind().uuid)
    const active = profile.skins.find((s) => s.active)
    if (active == null) throw new SkinsManager.SkinsError('NOT_FOUND')
    const texture = await skins.fetchTexture(active.url, { accountUuid: profile.uuid })
    return skins.addToLibrary({ name: profile.name, variant: active.variant, png: texture.buffer, source: 'account' })
}))
ipcMain.handle('hellmc:skins-remove', (_event, id) => skinsGuard(async () => skins.removeFromLibrary(id)))
ipcMain.handle('hellmc:skins-rename', (_event, id, name) => skinsGuard(async () => skins.renameInLibrary(id, name)))
ipcMain.handle('hellmc:skins-set-variant', (_event, id, variant) => skinsGuard(async () => skins.setVariantInLibrary(id, variant)))
// Aplicar: Microsoft → puja a Mojang (tothom la veu); offline → només selecció local.
ipcMain.handle('hellmc:skins-apply', (_event, id) => skinsGuard(async () => {
    const account = selectedAccountKind()
    if (account.uuid == null) throw new SkinsManager.SkinsError('NO_TOKEN')
    if (!account.microsoft) {
        skins.setLocalSelection(account.uuid, id)
        return { scope: 'local' }
    }
    const entry = skins.listLibrary().skins.find((s) => s.id === id)
    if (entry == null) throw new SkinsManager.SkinsError('NOT_FOUND')
    await skins.setSkinFromPng(skins.readLibraryPng(id).buffer, entry.variant)
    return { scope: 'mojang' }
}))
ipcMain.handle('hellmc:skins-clear-local', () => skinsGuard(async () => {
    const account = selectedAccountKind()
    if (account.uuid != null) skins.setLocalSelection(account.uuid, null)
}))
ipcMain.handle('hellmc:skins-set-cape', (_event, capeId) => skinsGuard(async () => {
    if (!selectedAccountKind().microsoft) throw new SkinsManager.SkinsError('NOT_MICROSOFT')
    return await withTextures(await skins.setActiveCape(capeId))
}))

/**
 * Qui sap quins UUID són d'amics (el mòdul social ho registra en carregar-se): el visor només pot demanar la skin de gent que el relay ha donat a
 * aquest compte, mai la d'un UUID qualsevol. Es registra des de fora per no crear una dependència circular skins ↔ social.
 */
let knownFriendUuids = () => new Set()
function setFriendUuidProvider(provider) {
    knownFriendUuids = provider
}

module.exports = {
    selectedAccountKind,
    setFriendUuidProvider,
    skins
}
