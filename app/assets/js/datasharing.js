'use strict'

// D26 (06 §8.2, 01 §3.1.1): mods/`config`/`logs`/`crash-reports` es queden **sempre** separats per
// versió (cap loader permet dir-los que llegeixin mods d'un altre lloc, 06 §8.2 «Per què `gameDir`
// per versió no es pot eliminar») — només aquesta llista fixa de dades del jugador es pot compartir,
// mai configurable des de fora d'aquest fitxer.

const fs = require('fs-extra')
const path = require('path')
const { LoggerUtil } = require('hellmc-core')
const ConfigManager = require('./configmanager')

const logger = LoggerUtil.getLogger('DataSharing')

const SHARED_DIRS = ['saves', 'resourcepacks', 'shaderpacks', 'screenshots']
const SHARED_FILES = ['options.txt', 'optionsof.txt', 'servers.dat', 'hotbar.nbt']

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

// 06 §8.2: canviar de mode «no mou ni fusiona res automàticament» — la carpeta/fitxer real anterior
// es queda al disc, intacta, només deixa d'usar-se. Sufix amb timestamp perquè, si el jugador
// alterna de mode diverses vegades, cada transició deixa la seva pròpia còpia en comptes de
// xocar amb una anterior.
async function backupAside(linkPath) {
    const backupPath = `${linkPath}.separate-${Date.now()}`
    await fs.rename(linkPath, backupPath)
    logger.info(`Kept previous separate data intact at ${backupPath} (never merged automatically, 06 §8.2).`)
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

async function linkFile(gameDir, sharedRoot, name) {
    const linkPath = path.join(gameDir, name)
    const sharedTarget = path.join(sharedRoot, name)
    const stat = await fs.lstat(linkPath).catch(() => null)
    if (stat != null) {
        // Un hardlink no té cap senyal fiable de "és un enllaç" (no hi ha equivalent d'`isSymbolicLink`
        // per hardlinks) — comparar `dev`+`ino` contra l'arrel compartida és l'única manera correcta
        // de saber si ja és el mateix fitxer físic.
        const sharedStat = await fs.stat(sharedTarget).catch(() => null)
        if (sharedStat != null && sharedStat.dev === stat.dev && sharedStat.ino === stat.ino) return
        await backupAside(linkPath)
    }
    await fs.ensureDir(path.dirname(sharedTarget))
    if (!await fs.pathExists(sharedTarget)) {
        await fs.ensureFile(sharedTarget)
    }
    await fs.link(sharedTarget, linkPath)
}

async function unlinkFile(gameDir, sharedRoot, name) {
    const linkPath = path.join(gameDir, name)
    const stat = await fs.lstat(linkPath).catch(() => null)
    if (stat == null) return
    // Un hardlink no es distingeix d'un fitxer real per `stat` sol (§linkFile) — cal comparar
    // `dev`+`ino` contra l'arrel compartida abans d'esborrar res. **Crític**: sense aquesta
    // comprovació, qualsevol versió `forcedSeparate` o amb l'interruptor desactivat perdria
    // `options.txt`/`servers.dat` reals a cada llançament (`fs.remove` cec sobre un fitxer que mai
    // ha estat un enllaç) — aquest camí s'executa a **cada** llançament, no només en canviar de mode.
    const sharedTarget = path.join(sharedRoot, name)
    const sharedStat = await fs.stat(sharedTarget).catch(() => null)
    if (sharedStat != null && sharedStat.dev === stat.dev && sharedStat.ino === stat.ino) {
        await fs.remove(linkPath)
    }
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
                await linkFile(gameDir, sharedRoot, name)
            } else {
                await unlinkFile(gameDir, sharedRoot, name)
            }
        } catch (err) {
            logger.warn(`Could not ${shared ? 'link' : 'unlink'} shared file "${name}" for ${versionId}, keeping it separate.`, err)
        }
    }
}
