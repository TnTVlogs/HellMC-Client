'use strict'

// D26 (06 §8.2, 01 §3.1.1): mods/`config`/`logs`/`crash-reports` es queden **sempre** separats per
// versió (cap loader permet dir-los que llegeixin mods d'un altre lloc, 06 §8.2 «Per què `gameDir`
// per versió no es pot eliminar») — només aquesta llista fixa de dades del jugador es pot compartir,
// mai configurable des de fora d'aquest fitxer.
//
// Carpetes (`saves`, `resourcepacks`, …): enllaç (junction a Windows, symlink a la resta) cap a l'arrel compartida.
// Fitxers petits (`options.txt`, `servers.dat`, …): **còpies sincronitzades**, no enllaços durs (B6). Minecraft desa
// `servers.dat` escrivint un fitxer temporal i substituint-lo, cosa que **trencava l'enllaç dur** en silenci: al llançament
// següent el fitxer bo s'apartava a `*.separate-<ts>` i es perdien els canvis. Ara: en llançar, la còpia més recent (per data)
// gana i es copia a l'altra banda; en tancar el joc, la instància es copia a l'arrel compartida.

const fs = require('fs-extra')
const path = require('path')
const { LoggerUtil } = require('hellmc-core')
const ConfigManager = require('./configmanager')

const logger = LoggerUtil.getLogger('DataSharing')

const SHARED_DIRS = ['saves', 'resourcepacks', 'shaderpacks', 'screenshots']
const SHARED_FILES = ['options.txt', 'optionsof.txt', 'servers.dat', 'hotbar.nbt']

// Còpies `*.separate-<ts>` que es conserven per element (les més noves); abans s'acumulaven sense límit.
const KEEP_SEPARATE_BACKUPS = 3

// Exportat perquè `hellmc:versions-uninstall` (09 P6) mai esborri un d'aquests noms directament:
// quan estan enllaçats (`shared`), esborrar-los per sota fora d'aquest mòdul podria (segons la
// implementació concreta de `fs.rm` amb symlinks/junctions) arriscar tocar l'arrel compartida en
// comptes de només l'enllaç — més segur excloure'ls sencers que confiar-hi cegament. Una sola llista
// (aquí), mai duplicada a `index.js`.
exports.SHAREABLE_NAMES = SHARED_DIRS.concat(SHARED_FILES)

/**
 * Whether a version's shareable data should currently be linked against the shared root. The
 * admin's `forcedSeparate` (01 §3.1.1) always wins over the player's own preference — the player
 * never even sees the toggle for a `forcedSeparate` version (07 §4.4).
 *
 * @param {Object|null} rawVersion The raw `Version` from the distribution.
 * @param {string} versionId The version's id (key for the player's own preference).
 * @returns {boolean}
 */
exports.isEffectivelyShared = function (rawVersion, versionId) {
    if (rawVersion != null && rawVersion.dataSharing === 'forcedSeparate') {
        return false
    }
    return ConfigManager.getDataSharingPreference(versionId)
}

async function pruneBackups(linkPath) {
    try {
        const dir = path.dirname(linkPath)
        const prefix = `${path.basename(linkPath)}.separate-`
        const names = (await fs.readdir(dir)).filter((n) => n.startsWith(prefix)).sort()
        for (const old of names.slice(0, Math.max(0, names.length - KEEP_SEPARATE_BACKUPS))) {
            await fs.remove(path.join(dir, old))
        }
    } catch { /* només neteja: mai ha de fer fallar el llançament */ }
}

// 06 §8.2: canviar de mode «no mou ni fusiona res automàticament» — la carpeta/fitxer real anterior
// es queda al disc, intacta, només deixa d'usar-se. Sufix amb timestamp perquè, si el jugador
// alterna de mode diverses vegades, cada transició deixa la seva pròpia còpia en comptes de
// xocar amb una anterior (es conserven les últimes `KEEP_SEPARATE_BACKUPS`).
async function backupAside(linkPath) {
    const backupPath = `${linkPath}.separate-${Date.now()}`
    await fs.rename(linkPath, backupPath)
    logger.info(`Kept previous separate data intact at ${backupPath} (never merged automatically, 06 §8.2).`)
    await pruneBackups(linkPath)
}

async function linkDir(gameDir, sharedRoot, name) {
    const linkPath = path.join(gameDir, name)
    const sharedTarget = path.join(sharedRoot, name)
    const stat = await fs.lstat(linkPath).catch(() => null)
    if (stat != null && stat.isSymbolicLink()) {
        // Comparació de string, no de contingut: un junction/symlink que ja apunta al lloc correcte
        // (cas normal, la immensa majoria de llançaments) s'hi queda tal qual. Si la comparació dona
        // fals negatiu per normalització de ruta (junctions de Windows), com a molt es recrea
        // l'enllaç sense necessitat — mai perd dades, l'arrel compartida no es toca.
        const current = await fs.readlink(linkPath).catch(() => null)
        if (current === sharedTarget) return
        await fs.remove(linkPath)
    } else if (stat != null) {
        await backupAside(linkPath)
    }
    await fs.ensureDir(sharedTarget)
    // Junction a Windows (no cal administrador, a diferència d'un symlink de directori); symlink
    // normal a macOS/Linux (06 §8.2, taula del mecanisme).
    await fs.ensureSymlink(sharedTarget, linkPath, process.platform === 'win32' ? 'junction' : 'dir')
}

async function unlinkDir(gameDir, name) {
    const linkPath = path.join(gameDir, name)
    const stat = await fs.lstat(linkPath).catch(() => null)
    if (stat != null && stat.isSymbolicLink()) {
        await fs.remove(linkPath)
    }
    // «La propera vegada l'enllaç es reemplaça per una carpeta real buida» (06 §8.2) — mai es
    // reconstrueix a partir de l'arrel compartida, la versió comença de zero en aquest element.
    await fs.ensureDir(linkPath)
}

function sameFile(a, b) {
    return a != null && b != null && a.dev === b.dev && a.ino === b.ino && a.ino !== 0
}

/** Un enllaç dur antic (versions anteriors del client) es converteix en un fitxer independent. */
async function breakLegacyHardlink(filePath) {
    const tmp = `${filePath}.tmp-${process.pid}`
    await fs.copyFile(filePath, tmp)
    await fs.rename(tmp, filePath)
}

async function copyKeepingTime(from, to) {
    await fs.ensureDir(path.dirname(to))
    const tmp = `${to}.tmp-${process.pid}`
    await fs.copyFile(from, tmp)
    const { atime, mtime } = await fs.stat(from)
    await fs.utimes(tmp, atime, mtime)
    await fs.rename(tmp, to)
}

/**
 * Abans de llançar: la còpia més recent (per data de modificació) entre la instància i l'arrel compartida gana.
 * No es creen fitxers buits (a la `.minecraft` del sistema no s'hi escriu res que no existeixi a la instància).
 */
async function syncFileIn(gameDir, sharedRoot, name) {
    const instancePath = path.join(gameDir, name)
    const sharedPath = path.join(sharedRoot, name)
    const [instance, shared] = await Promise.all([fs.stat(instancePath).catch(() => null), fs.stat(sharedPath).catch(() => null)])
    if (instance == null && shared == null) return
    if (sameFile(instance, shared)) {
        await breakLegacyHardlink(instancePath)
        return
    }
    if (instance == null) {
        await copyKeepingTime(sharedPath, instancePath)
    } else if (shared == null) {
        await copyKeepingTime(instancePath, sharedPath)
    } else if (instance.mtimeMs > shared.mtimeMs + 1000) {
        await copyKeepingTime(instancePath, sharedPath)
    } else if (shared.mtimeMs > instance.mtimeMs + 1000) {
        await copyKeepingTime(sharedPath, instancePath)
    }
}

async function unlinkFile(gameDir, sharedRoot, name) {
    // Versió amb dades separades: només es trenca un possible enllaç dur d'una versió anterior del client; mai s'esborra res.
    const instancePath = path.join(gameDir, name)
    const [instance, shared] = await Promise.all([fs.stat(instancePath).catch(() => null), fs.stat(path.join(sharedRoot, name)).catch(() => null)])
    if (sameFile(instance, shared)) await breakLegacyHardlink(instancePath)
}

/**
 * Aplica D26 per a una versió, just abans de llançar (06 §8.2: mateix punt on l'app antiga crida
 * `syncModsFolder` — es fa aquí, no dins `ProcessBuilder`, perquè l'app antiga es quedi intacta).
 * Mai llança: un enllaç que falla (arrel compartida en un altre volum, sense permisos) cau a una
 * carpeta/fitxer real separat només per a aquell element, amb avís al log — no bloqueja el
 * llançament (06 §8.2, clàusula de fallback).
 *
 * @param {string} gameDir La carpeta d'instància de la versió (ja ha d'existir).
 * @param {Object|null} rawVersion El `Version` cru de la distribució.
 * @param {string} versionId L'id de la versió.
 */
exports.applyDataSharing = async function (gameDir, rawVersion, versionId) {
    const shared = exports.isEffectivelyShared(rawVersion, versionId)
    const sharedRoot = ConfigManager.getSharedDataRoot()
    for (const name of SHARED_DIRS) {
        try {
            if (shared) {
                await linkDir(gameDir, sharedRoot, name)
            } else {
                await unlinkDir(gameDir, name)
            }
        } catch (err) {
            logger.warn(`Could not ${shared ? 'link' : 'unlink'} shared folder "${name}" for ${versionId}, keeping it separate.`, err)
        }
    }
    for (const name of SHARED_FILES) {
        try {
            if (shared) {
                await syncFileIn(gameDir, sharedRoot, name)
            } else {
                await unlinkFile(gameDir, sharedRoot, name)
            }
        } catch (err) {
            logger.warn(`Could not ${shared ? 'sync' : 'detach'} shared file "${name}" for ${versionId}, keeping it separate.`, err)
        }
    }
}

/**
 * En tancar el joc: els fitxers compartits de la instància (que el joc ha pogut canviar) es copien a l'arrel compartida
 * perquè les altres versions els vegin. Mai llança.
 */
exports.syncBack = async function (gameDir, rawVersion, versionId) {
    if (!exports.isEffectivelyShared(rawVersion, versionId)) return
    const sharedRoot = ConfigManager.getSharedDataRoot()
    for (const name of SHARED_FILES) {
        try {
            const instancePath = path.join(gameDir, name)
            const sharedPath = path.join(sharedRoot, name)
            const [instance, shared] = await Promise.all([fs.stat(instancePath).catch(() => null), fs.stat(sharedPath).catch(() => null)])
            if (instance == null) continue
            if (shared == null || instance.mtimeMs > shared.mtimeMs + 1000 || instance.size !== shared.size) {
                await copyKeepingTime(instancePath, sharedPath)
            }
        } catch (err) {
            logger.warn(`Could not sync "${name}" back to the shared root for ${versionId}.`, err)
        }
    }
}
