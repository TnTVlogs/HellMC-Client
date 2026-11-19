'use strict'
// Skins dels amics per al menú del joc (docs/pendents/plans/11-social-f4.md): el joc no fa cap petició, només llegeix
// `<dir>/<uuid>.png` (PNG de skin ja validat i net per `skinsmanager`). Aquí es decideix què cal tenir i es manté la carpeta:
//  - només els UUID demanats (amics, sol·licituds); el que ja no hi és s'esborra (no es guarden skins d'ex-amics ni de bloquejats);
//  - un fitxer de menys de 24 h no es torna a demanar a ningú (la caché de skins també és al disc, així que reiniciar no repeteix res);
//  - les baixades es fan d'una en una i espaiades, perquè una llista llarga no martellegi Mojang.
// Mai llança: l'avatar és un extra visual.
const fs = require('node:fs')
const path = require('node:path')

const TTL_MS = 24 * 3600 * 1000
const isUuid = (s) => typeof s === 'string' && /^[0-9a-f]{32}$/.test(s)

/**
 * @param {object} deps
 * @param {(uuid: string) => Promise<Buffer|null>} deps.getSkin PNG net de la skin pública d'aquest UUID, o null
 * @param {string} deps.dir carpeta de sortida
 * @param {number} [deps.spacingMs] espera entre dues baixades
 * @param {() => number} [deps.now]
 * @param {(msg: string) => void} [deps.log]
 */
function create({ getSkin, dir, spacingMs = 700, now = Date.now, log = () => {} }) {
    const file = (uuid) => path.join(dir, `${uuid}.png`)
    let queue = []
    let running = false
    /** UUID que ja s'han intentat en aquesta sessió (amb o sense èxit): no es reintenten fins que canviï la llista. */
    const tried = new Set()

    function fresh(uuid) {
        try {
            return now() - fs.statSync(file(uuid)).mtimeMs < TTL_MS
        } catch {
            return false
        }
    }

    function prune(keep) {
        try {
            for (const name of fs.readdirSync(dir)) {
                const m = /^([0-9a-f]{32})\.png$/.exec(name)
                if (m != null && !keep.has(m[1])) fs.rmSync(path.join(dir, name), { force: true })
                else if (m == null && /\.tmp$/.test(name)) fs.rmSync(path.join(dir, name), { force: true })
            }
        } catch {
            /* la carpeta encara no existeix */
        }
        for (const u of [...tried]) if (!keep.has(u)) tried.delete(u)
    }

    async function pump() {
        if (running) return
        running = true
        try {
            while (queue.length > 0) {
                const uuid = queue.shift()
                if (fresh(uuid) || tried.has(uuid)) continue
                tried.add(uuid)
                try {
                    const png = await getSkin(uuid)
                    if (png != null && png.length > 0) {
                        fs.mkdirSync(dir, { recursive: true })
                        const tmp = `${file(uuid)}.tmp`
                        fs.writeFileSync(tmp, png)
                        fs.renameSync(tmp, file(uuid))
                    }
                } catch (err) {
                    log(`avatars: ${String(err && err.message).slice(0, 80)}`)
                }
                if (queue.length > 0) await new Promise((r) => setTimeout(r, spacingMs))
            }
        } finally {
            running = false
        }
    }

    /** Fa que la carpeta correspongui a aquesta llista d'UUID (els que falten es baixen en segon pla). */
    function sync(uuids) {
        try {
            const keep = new Set((Array.isArray(uuids) ? uuids : []).filter(isUuid).slice(0, 300))
            prune(keep)
            queue = [...keep].filter((u) => !fresh(u) && !tried.has(u))
            void pump()
        } catch (err) {
            log(`avatars: ${String(err && err.message).slice(0, 80)}`)
        }
    }

    return { sync, file }
}

module.exports = { create, TTL_MS }
