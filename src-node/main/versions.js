'use strict'
// Gestió de versions (instal·lar, verificar, desinstal·lar) i dades compartides entre versions.
// Mòdul del procés principal d'Electron (abans tot era a index.js). Registra els seus handlers IPC en carregar-se.
const { path, ConfigManager, fs, ipcMain, assertId, DistroAPI, FullRepair, SIGNING_KEYS, DataSharing, os } = require('./core')
const { beginVersionOp, acquireRepairLock } = require('./instances')



// ── 2.3: gestió de versions (instal·lar/verificar/desinstal·lar) ─────────────────────────────
// Carpeta d'instància per versió: mateixa convenció que `processbuilder.js:28`
// (`path.join(getInstanceDirectory(), versionId)`), mai un altre esquema inventat aquí.
function getVersionInstanceDir(versionId) {
    return path.join(ConfigManager.getInstanceDirectory(), versionId)
}
function getInstalledMarkerPath(versionId) {
    return path.join(getVersionInstanceDir(versionId), '.hellmc-installed.json')
}
// `hellmc-core` no exposa cap "quina revisió tinc instal·lada": es desa un marcador propi, senzill
// i fora de `config.json` (independent del que faci `ConfigManager`), només per saber si cal
// «Actualitzar» sense tornar a verificar tots els fitxers.
async function getDirectorySize(dir) {
    let total = 0
    let entries
    try {
        entries = await fs.promises.readdir(dir, { withFileTypes: true })
    } catch {
        return 0
    }
    for (const entry of entries) {
        const entryPath = path.join(dir, entry.name)
        if (entry.isDirectory()) {
            total += await getDirectorySize(entryPath)
        } else {
            try {
                total += (await fs.promises.stat(entryPath)).size
            } catch { /* esborrat just abans de llegir-lo, ignora */ }
        }
    }
    return total
}

const sizeCache = new Map() // versionId -> { size, at }
ipcMain.handle('hellmc:versions-status', async (_event, versionId) => {
    assertId(versionId)
    const gameDir = getVersionInstanceDir(versionId)
    if (!fs.existsSync(gameDir)) {
        // Ruta retornada igualment (07 §4.2 pt.4, pestanya Fitxers): és on s'instal·larà, útil
        // encara que «Obrir carpeta» no tingui gaire sentit fins que existeixi de veritat.
        return { installed: false, sizeBytes: 0, needsUpdate: false, path: gameDir }
    }
    // F3: recórrer tota la carpeta és car (milers de fitxers) i es demana des de moltes pantalles: es cacheja 5 min i
    // s'invalida en instal·lar/verificar/desinstal·lar.
    const cached = sizeCache.get(versionId)
    let sizeBytes
    if (cached != null && Date.now() - cached.at < 5 * 60 * 1000) {
        sizeBytes = cached.size
    } else {
        sizeBytes = await getDirectorySize(gameDir)
        sizeCache.set(versionId, { size: sizeBytes, at: Date.now() })
    }
    let installedRevision = null
    try {
        installedRevision = JSON.parse(fs.readFileSync(getInstalledMarkerPath(versionId), 'utf-8')).revision
    } catch { /* mai instal·lada amb aquest mecanisme (carpeta òrfena o versió anterior) */ }
    const distro = await DistroAPI.getDistribution()
    const current = distro.getVersionById(versionId)
    const needsUpdate = current != null && installedRevision != null && installedRevision !== current.rawVersion.version
    return { installed: true, sizeBytes, needsUpdate, path: gameDir }
})

// Reutilitzat tant per `install` com per `verify`: `FullRepair` ja és el "verifica i arregla el que
// calgui" (07 §4.3, «Verificar/Reparar: reutilitza el flux de reparació actual») — `hellmc-core` no
// distingeix un mode "només comprovar" d'un "comprovar i baixar".
async function performRepair(versionId, onProgress) {
    const distro = await DistroAPI.getDistribution()
    const selectedVersion = distro.getVersionById(versionId)
    if (selectedVersion == null) {
        throw new Error(`Version ${versionId} not found in distribution.`)
    }
    const repair = new FullRepair(
        ConfigManager.getCommonDirectory(),
        ConfigManager.getInstanceDirectory(),
        ConfigManager.getLauncherDirectory(),
        versionId,
        DistroAPI.isDevMode(),
        SIGNING_KEYS
    )
    repair.spawnReceiver()
    try {
        onProgress({ percent: 0, message: 'verifying-files' })
        await repair.verifyFiles((percent) => onProgress({ percent, message: 'verifying-files' }))
        onProgress({ percent: 0, message: 'downloading' })
        await repair.download((percent) => onProgress({ percent, message: 'downloading' }))
    } finally {
        repair.destroyReceiver()
    }
    fs.mkdirSync(getVersionInstanceDir(versionId), { recursive: true })
    fs.writeFileSync(getInstalledMarkerPath(versionId), JSON.stringify({ revision: selectedVersion.rawVersion.version }))
}

function makeVersionsProgressSender(event, versionId) {
    const sender = event.sender
    return (progress) => { if (!sender.isDestroyed()) sender.send('hellmc:versions-progress', versionId, progress) }
}

async function runRepairOp(kind, event, versionId) {
    const endOp = beginVersionOp(versionId, kind)
    const releaseLock = await acquireRepairLock()
    try {
        await performRepair(versionId, makeVersionsProgressSender(event, versionId))
    } finally {
        releaseLock()
        endOp()
        sizeCache.delete(versionId)
    }
}
ipcMain.handle('hellmc:versions-install', (event, versionId) => runRepairOp('install', event, versionId))
ipcMain.handle('hellmc:versions-verify', (event, versionId) => runRepairOp('verify', event, versionId))
ipcMain.handle('hellmc:versions-uninstall', async (_event, versionId) => {
    // S4/B5: només versions de la distribució (mai un camí lliure) i mai amb el joc en marxa o una altra operació en curs.
    const distro = await DistroAPI.getDistribution()
    if (distro.getVersionById(versionId) == null) throw new Error('VERSION_NOT_FOUND')
    const endOp = beginVersionOp(versionId, 'uninstall')
    try {
        await uninstallVersion(versionId)
    } finally {
        endOp()
        sizeCache.delete(versionId)
    }
})
async function uninstallVersion(versionId) {
    // 09 P6: esborra mods/libraries/config gestionada, però conserva les dades del jugador —
    // exactament la llista de D26 (`DataSharing.SHAREABLE_NAMES`, 01 §3.1.1), no un duplicat propi:
    // quan un d'aquests noms és un enllaç (`shared`), mai s'ha d'esborrar per sota, encara que
    // `fs.rm` amb `recursive` en teoria només hauria de treure l'enllaç i no el contingut real.
    const PRESERVE = new Set(DataSharing.SHAREABLE_NAMES)
    const gameDir = getVersionInstanceDir(versionId)
    if (!fs.existsSync(gameDir)) return
    const entries = await fs.promises.readdir(gameDir)
    await Promise.all(
        entries
            .filter((name) => !PRESERVE.has(name))
            .map((name) => fs.promises.rm(path.join(gameDir, name), { recursive: true, force: true }))
    )
}

// ── 2.3: dades compartides entre versions (D26, 06 §8.2/07 §4.4/§6.2) ───────────────────────────
function getSystemMinecraftDir() {
    if (process.platform === 'win32') return path.join(process.env.APPDATA, '.minecraft')
    if (process.platform === 'darwin') return path.join(os.homedir(), 'Library', 'Application Support', 'minecraft')
    return path.join(os.homedir(), '.minecraft')
}
ipcMain.handle('hellmc:datasharing-get-preference', async (_event, versionId) => {
    const distro = await DistroAPI.getDistribution()
    const rawVersion = distro.getVersionById(versionId)?.rawVersion ?? null
    return {
        shared: DataSharing.isEffectivelyShared(rawVersion, versionId),
        forced: rawVersion?.dataSharing === 'forcedSeparate'
    }
})
ipcMain.handle('hellmc:datasharing-set-preference', async (_event, versionId, shared) => {
    assertId(versionId)
    if (typeof shared !== 'boolean') throw new Error('INVALID_VALUE')
    ConfigManager.setDataSharingPreference(versionId, shared)
    ConfigManager.save()
})
ipcMain.handle('hellmc:datasharing-get-root', async () => {
    const current = ConfigManager.getSharedDataRoot()
    // «Sistema» només si la ruta desada coincideix *exactament* amb la `.minecraft` real d'aquesta
    // màquina — si l'usuari mai l'ha triat, `getSharedDataRoot()` ja torna la per defecte (HellMC).
    return { mode: current === getSystemMinecraftDir() ? 'system' : 'hellmc', path: current }
})
ipcMain.handle('hellmc:datasharing-set-root', async (_event, mode) => {
    ConfigManager.setSharedDataRoot(mode === 'system' ? getSystemMinecraftDir() : null)
    ConfigManager.save()
})

module.exports = {
    getVersionInstanceDir
}
