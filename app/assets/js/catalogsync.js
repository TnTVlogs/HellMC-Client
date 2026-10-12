'use strict'

// Catàleg de cosmètics i emotes (docs/client-cosmetics/20-cataleg-al-panell.md): baixa del servidor el que els administradors
// han publicat al panell i ho deixa a la caché de l'Armari (`wardrobemanager.install`). El jugador no importa res.
//
// Seguretat: la llista es valida camp a camp; les URLs de descàrrega es construeixen aquí (mai es segueix la que dona el servidor)
// i no se segueixen redireccions; cada model s'acaba comprovant contra el SHA-256 de la llista abans de desar-se, i després el
// lector (launcher i joc) el torna a validar en carregar-lo. Sense xarxa o amb una resposta invàlida no es toca res.

const ORIGIN = 'https://hellmcclient.sergidalmau.dev'
const LIST_TIMEOUT_MS = 8000
const FILE_TIMEOUT_MS = 15000
const MAX_LIST_BYTES = 512 * 1024
const MAX_MODEL_BYTES = 1024 * 1024
const MAX_ITEMS = 500
const SLOTS = ['head', 'face', 'back', 'body', 'feet']
const BONES = ['head', 'body', 'rightArm', 'leftArm', 'rightLeg', 'leftLeg']

const isId = (v) => typeof v === 'string' && /^[0-9a-f]{12}$/.test(v)
const isSha = (v) => typeof v === 'string' && /^[0-9a-f]{64}$/.test(v)
const finite = (v) => typeof v === 'number' && Number.isFinite(v)

/** Un element de la llista ja net, o `null` si no compleix el contracte (es descarta sol, la resta segueix). */
function cleanItem(raw) {
    if (raw == null || typeof raw !== 'object') return null
    if (!isId(raw.id) || !isSha(raw.sha256) || (raw.kind !== 'cosmetic' && raw.kind !== 'emote')) return null
    if (typeof raw.name !== 'string' || raw.name.trim() === '' || !Number.isInteger(raw.size) || raw.size < 1 || raw.size > MAX_MODEL_BYTES) return null
    const item = { id: raw.id, kind: raw.kind, name: raw.name, sha256: raw.sha256, size: raw.size }
    if (raw.kind === 'cosmetic') {
        item.slot = SLOTS.includes(raw.slot) ? raw.slot : 'head'
        if (BONES.includes(raw.attach)) item.attach = raw.attach
        if (Array.isArray(raw.offset) && raw.offset.length === 3 && raw.offset.every(finite)) item.offset = raw.offset
        if (finite(raw.scale) && raw.scale >= 0.1 && raw.scale <= 10) item.scale = raw.scale
    }
    return item
}

/** Comparació de metadades entre l'element de la llista i el que hi ha instal·lat. */
function sameMeta(item, meta) {
    return meta != null && meta.name === item.name && meta.slot === item.slot && meta.attach === item.attach && meta.scale === item.scale
        && JSON.stringify(meta.offset ?? null) === JSON.stringify(item.offset ?? null)
}

/**
 * @param {{wardrobe: ReturnType<typeof import('./wardrobemanager').create>, origin?: string, fetchFn?: typeof fetch, log?: (msg: string) => void}} deps
 */
function create({ wardrobe, origin = ORIGIN, fetchFn = (...args) => fetch(...args), log = () => {} }) {
    let running = null

    async function readLimited(res, limit) {
        const length = Number(res.headers.get('content-length'))
        if (Number.isFinite(length) && length > limit) throw new Error('resposta massa gran')
        const data = Buffer.from(await res.arrayBuffer())
        if (data.length > limit) throw new Error('resposta massa gran')
        return data
    }

    async function get(url, timeout, limit) {
        const res = await fetchFn(url, { redirect: 'error', signal: AbortSignal.timeout(timeout), headers: { accept: 'application/json' } })
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        return readLimited(res, limit)
    }

    async function run() {
        const result = { added: 0, updated: 0, removed: 0, failed: 0, offline: false }
        let list
        try {
            const body = JSON.parse((await get(`${origin}/api/catalog`, LIST_TIMEOUT_MS, MAX_LIST_BYTES)).toString('utf8'))
            if (body == null || body.format !== 1 || !Array.isArray(body.items)) throw new Error('format de catàleg desconegut')
            list = body.items.slice(0, MAX_ITEMS).map(cleanItem).filter((i) => i != null)
        } catch (err) {
            log(`catàleg: no s'ha pogut llegir (${err.message}); es manté el que hi ha`)
            result.offline = true
            return result
        }
        const seen = new Set()
        for (const item of list) {
            if (seen.has(item.id)) continue
            seen.add(item.id)
            try {
                const installed = wardrobe.installedHash(item.id)
                if (installed === item.sha256) {
                    if (!sameMeta(item, wardrobe.installedMeta(item.id))) {
                        // Només han canviat el nom, la ranura…: es reinstal·la el model que ja és al disc (mateix hash).
                        wardrobe.install({ ...item, model: Buffer.from(wardrobe.readItem(item.id).model, 'utf8') })
                        result.updated++
                    }
                    continue
                }
                const model = await get(`${origin}/api/catalog/items/${item.id}/${item.sha256}.bbmodel`, FILE_TIMEOUT_MS, MAX_MODEL_BYTES)
                wardrobe.install({ ...item, model })
                if (installed == null) result.added++
                else result.updated++
            } catch (err) {
                result.failed++
                log(`catàleg: ${item.id} (${item.name}) no s'ha pogut instal·lar: ${err.message ?? err.code}`)
            }
        }
        // Només es retira el que el servidor ja no ofereix quan la llista s'ha llegit sencera.
        try {
            result.removed = wardrobe.removeCatalogExcept([...seen]).length
        } catch (err) {
            log(`catàleg: no s'ha pogut netejar: ${err.message}`)
        }
        log(`catàleg: ${result.added} nous, ${result.updated} actualitzats, ${result.removed} retirats, ${result.failed} amb error`)
        return result
    }

    /** Una sincronització alhora: si ja n'hi ha una en marxa, es comparteix el resultat. Mai llança. */
    function sync() {
        running ??= run().catch((err) => {
            log(`catàleg: error inesperat: ${err.message}`)
            return { added: 0, updated: 0, removed: 0, failed: 0, offline: true }
        }).finally(() => { running = null })
        return running
    }

    return { sync }
}

module.exports = { create, cleanItem, ORIGIN }
