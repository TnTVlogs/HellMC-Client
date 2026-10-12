'use strict'

// HellMC Runtime (docs/client-cosmetics/09 i 19): l'únic Java agent del client (cosmètics, emotes, roda, menú del joc, Discord).
// Viu al servidor: el panell el publica com a fitxers de cada versió (`files/hellmc-runtime/`) i el client el baixa i en verifica
// el hash amb la resta de la distribució, a `<instància>/hellmc-runtime/` (`hellmc-runtime-<hash>.jar` + `modules/*-<hash>.jar`).
// Així s'actualitza amb «Publica» al panell, sense treure client. Només en passa els arguments a la JVM quan tot és al seu lloc.
// El runtime TAMBÉ s'autoprotegeix (no fa res si no rep la versió del client i el format de distribució que li passem aquí).
// Sense dependre d'Electron: les carpetes s'injecten (així es pot provar).

const fs = require('fs')
const path = require('path')

/** Format de distribució que llegeix aquest client (`distribution-v2.json`, camp `format`). */
const DISTRIBUTION_FORMAT = 2

const INSTANCE_FOLDER = 'hellmc-runtime'

/**
 * @param {object} options
 * @param {string} options.dataDir `userData` del client (skins, armari, paquet de recursos)
 * @param {string} options.clientVersion versió del client (`app.getVersion()`)
 * @param {string} [options.devRuntimeDir] només desenvolupament: carpeta amb `hellmc-runtime.jar` i `modules/` (sortida de `tools/build.sh`)
 * @param {NodeJS.ProcessEnv} [options.env]
 */
function create({ dataDir, clientVersion, devRuntimeDir = null, env = process.env }) {
    const jarsIn = (dir) => {
        try {
            return fs.readdirSync(dir).filter((f) => f.endsWith('.jar'))
        } catch {
            return []
        }
    }

    /** On és el runtime d'aquesta instància: el que ha baixat la distribució, o (desenvolupament) la carpeta local. @returns {{agentJar: string, modulesDir: string}|null} */
    function locate(gameDir) {
        const candidates = [
            { dir: path.join(gameDir, INSTANCE_FOLDER), pick: (f) => /^hellmc-runtime-.+.jar$/.test(f) },
            ...(devRuntimeDir ? [{ dir: devRuntimeDir, pick: (f) => f === 'hellmc-runtime.jar' }] : [])
        ]
        for (const { dir, pick } of candidates) {
            const jars = jarsIn(dir).filter(pick)
            const modulesDir = path.join(dir, 'modules')
            if (jars.length === 0 || jarsIn(modulesDir).length === 0) continue
            // Després de `prune` n'hi ha un de sol; si no, el més nou.
            const newest = jars.map((f) => ({ f, t: fs.statSync(path.join(dir, f)).mtimeMs })).sort((x, y) => y.t - x.t)[0].f
            return { agentJar: path.join(dir, newest), modulesDir }
        }
        return null
    }

    /** @returns {boolean} el runtime és al seu lloc i no està desactivat (`HELLMC_NO_RUNTIME=1`) */
    function available(gameDir) {
        return env.HELLMC_NO_RUNTIME !== '1' && locate(gameDir) != null
    }

    /**
     * Esborra de `<instància>/hellmc-runtime/` els jars que la distribució ja no inclou (compilacions velles): el runtime
     * carrega TOTS els jars de la carpeta de mòduls, així que no n'hi pot quedar de vells.
     * @param {string} gameDir
     * @param {string[]} expectedPaths camins absoluts dels fitxers `hellmc-runtime/…` que la distribució declara
     * @returns {string[]} els fitxers esborrats
     */
    function prune(gameDir, expectedPaths) {
        const keep = new Set(expectedPaths.map((p) => path.resolve(p)))
        const removed = []
        for (const sub of ['', 'modules']) {
            const dir = path.join(gameDir, INSTANCE_FOLDER, sub)
            for (const f of jarsIn(dir)) {
                const file = path.resolve(dir, f)
                if (keep.has(file)) continue
                try {
                    fs.rmSync(file, { force: true })
                    removed.push(file)
                } catch {
                    /* en ús o sense permís: es provarà a la propera partida */
                }
            }
        }
        return removed
    }

    /**
     * Arguments de la JVM per carregar el runtime (buit si no n'hi ha o no està disponible).
     * @param {{minecraftVersion: string, gameDir: string}} launch
     * @returns {string[]}
     */
    function jvmArgs({ minecraftVersion, gameDir }) {
        const found = env.HELLMC_NO_RUNTIME === '1' ? null : locate(gameDir)
        if (found == null || typeof clientVersion !== 'string' || clientVersion === '') return []
        return [
            `-javaagent:${found.agentJar}`,
            `-Dhellmc.client.version=${clientVersion}`,
            `-Dhellmc.distribution.format=${DISTRIBUTION_FORMAT}`,
            `-Dhellmc.mc.version=${minecraftVersion}`,
            `-Dhellmc.modules=${found.modulesDir}`,
            `-Dhellmc.data=${dataDir}`,
            `-Dhellmc.log=${path.join(gameDir, 'logs', 'hellmc-runtime.log')}`,
            `-Dhellmc.pack=${path.join(dataDir, 'runtime', 'pack')}`,
            `-Dhellmc.skins=${path.join(dataDir, 'skins')}`,
            `-Dhellmc.wardrobe=${path.join(dataDir, 'wardrobe')}`
        ]
    }

    return { available, jvmArgs, prune, locate }
}

module.exports = { create, DISTRIBUTION_FORMAT, INSTANCE_FOLDER }
