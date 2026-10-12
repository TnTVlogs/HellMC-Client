'use strict'

// Armari: selecció de cosmètics i emotes del compte (docs/client-cosmetics/17-armari-i-seleccio.md).
// El launcher ESCRIU `equipped.json` i el catàleg local (`cache/<id>/`); el runtime del joc els LLEGEIX
// (es mira cada ~1 s, així un canvi aquí es veu al joc sense reiniciar). Sense dependre d'Electron.
//
//   <dir>/equipped.json              { "<uuid del compte>": { cosmetics: { head: id|null, … }, emotes: [8 × id|null] } }
//   <dir>/cache/<id>/<id>.bbmodel    model de Blockbench (cosmètic o emote)
//   <dir>/cache/<id>/<id>.hmc.json   { kind: 'cosmetic'|'emote', name, slot?, attach?, offset?, scale?, access, source: 'catalog', sha256 }
//   <dir>/cache/<id>/<id>.preview.png  render quiet del cosmètic (el genera el launcher; el joc el mostra al menú). Opcional.
// `cache/` l'omple `catalogsync.js` amb el catàleg del servidor (el panell el gestiona; només administradors). El jugador no importa res.

const fs = require('fs')
const path = require('path')
const crypto = require('crypto')
const PngUtil = require('./pngutil')

const SLOTS = ['head', 'face', 'back', 'body', 'feet']
const BONES = ['head', 'body', 'rightArm', 'leftArm', 'rightLeg', 'leftLeg']
const KINDS = ['cosmetic', 'emote']
const WHEEL_SIZE = 8
const MAX_MODEL_BYTES = 8 * 1024 * 1024
const MAX_ITEMS = 500
const ID_RE = /^[A-Za-z0-9_.-]{1,64}$/
const CATALOG_ID_RE = /^[0-9a-f]{12}$/
const SHA_RE = /^[0-9a-f]{64}$/
const MAX_PREVIEW_BYTES = 300 * 1024
const MAX_PREVIEW_SIDE = 512

class WardrobeError extends Error {
    constructor(code, detail) {
        super(`WARDROBE_ERROR:${code}`)
        this.code = code
        this.detail = detail
    }
}

function cleanName(name) {
    const value = typeof name === 'string' ? name.replace(/[\u0000-\u001f]/g, '').trim().slice(0, 40) : ''
    return value === '' ? 'Item' : value
}

function finite(value, fallback) {
    return typeof value === 'number' && Number.isFinite(value) ? value : fallback
}

/** Os del jugador on s'enganxa un cosmètic de la ranura, si el fitxer auxiliar no ho diu (el mateix que fa el joc). */
function defaultAttach(slot) {
    if (slot === 'back' || slot === 'body') return 'body'
    return slot === 'feet' ? 'leftLeg' : 'head'
}

const TEXTURE_PREFIX = 'data:image/png;base64,'

/**
 * Un cosmètic del catàleg du la textura incrustada en PNG ja NETA (el panell la reescriu): aquí es torna a comprovar sencera i ha de ser
 * idèntica a la seva versió neta. Un PNG amb metadades, dades afegides o estructura trencada no arriba mai al lector d'imatges del joc.
 * (Els models de prova sense textures —només estructura— es deixen passar: els lectors ja exigeixen exactament 1 textura.)
 */
function checkTexture(json) {
    if (!Array.isArray(json.textures) || json.textures.length === 0) return
    const source = json.textures[0] != null ? json.textures[0].source : null
    if (typeof source !== 'string' || !source.startsWith(TEXTURE_PREFIX)) throw new WardrobeError('INVALID_MODEL')
    try {
        const png = Buffer.from(source.slice(TEXTURE_PREFIX.length), 'base64')
        const cleaned = PngUtil.clean(png, { maxWidth: 256, maxHeight: 256, accept: PngUtil.ACCEPT_TEXTURE, keep: PngUtil.ACCEPT_TEXTURE })
        if (!cleaned.data.equals(png)) throw new WardrobeError('INVALID_MODEL')
    } catch (err) {
        throw err instanceof WardrobeError ? err : new WardrobeError('INVALID_MODEL')
    }
}

/** Valida que sigui un `.bbmodel` (JSON amb `elements` o `outliner`) abans de desar-lo. */
function checkModel(buffer, kind) {
    if (!Buffer.isBuffer(buffer) || buffer.length === 0 || buffer.length > MAX_MODEL_BYTES) throw new WardrobeError('INVALID_MODEL')
    let json
    try {
        json = JSON.parse(buffer.toString('utf8'))
    } catch {
        throw new WardrobeError('INVALID_MODEL')
    }
    if (json == null || typeof json !== 'object') throw new WardrobeError('INVALID_MODEL')
    if (kind === 'cosmetic' && !Array.isArray(json.elements)) throw new WardrobeError('INVALID_MODEL')
    if (kind === 'cosmetic') checkTexture(json)
    if (kind === 'emote' && !Array.isArray(json.animations)) throw new WardrobeError('INVALID_MODEL')
}

const DEFAULT_SETTINGS = { hideOthers: false, maxDistance: 32, autoCamera: true, wheelKey: 'B', menuKey: 'N' }

/** Ajustos validats (el joc fa el mateix en llegir-los): valors fora de rang o desconeguts tornen al per defecte. */
function normalizeSettings(raw) {
    const r = raw != null && typeof raw === 'object' ? raw : {}
    const distance = typeof r.maxDistance === 'number' && Number.isFinite(r.maxDistance) ? Math.round(r.maxDistance) : DEFAULT_SETTINGS.maxDistance
    const key = (value, def) => (typeof value === 'string' && /^[A-Za-z]$/.test(value) ? value.toUpperCase() : def)
    const settings = {
        hideOthers: typeof r.hideOthers === 'boolean' ? r.hideOthers : DEFAULT_SETTINGS.hideOthers,
        maxDistance: Math.min(128, Math.max(8, distance)),
        autoCamera: typeof r.autoCamera === 'boolean' ? r.autoCamera : DEFAULT_SETTINGS.autoCamera,
        wheelKey: key(r.wheelKey, DEFAULT_SETTINGS.wheelKey),
        menuKey: key(r.menuKey, DEFAULT_SETTINGS.menuKey)
    }
    return settings
}

/** @param {{dir: string}} options carpeta `<userData>/wardrobe` */
function create({ dir }) {
    const equippedFile = path.join(dir, 'equipped.json')
    const cacheDir = path.join(dir, 'cache')

    function itemDir(id) {
        if (typeof id !== 'string' || !ID_RE.test(id) || id.startsWith('.')) throw new WardrobeError('INVALID_ID')
        return path.join(cacheDir, id)
    }

    function readSidecar(id) {
        try {
            const meta = JSON.parse(fs.readFileSync(path.join(itemDir(id), `${id}.hmc.json`), 'utf8'))
            if (meta == null || typeof meta !== 'object' || !KINDS.includes(meta.kind)) return null
            if (!fs.existsSync(path.join(itemDir(id), `${id}.bbmodel`))) return null
            return meta
        } catch {
            return null
        }
    }

    /** Catàleg local: tot el que hi ha a `cache/` amb model i fitxer auxiliar vàlids. */
    function catalog() {
        let names
        try {
            names = fs.readdirSync(cacheDir)
        } catch {
            return []
        }
        const items = []
        for (const id of names.sort()) {
            if (!ID_RE.test(id) || id.startsWith('.')) continue
            const meta = readSidecar(id)
            if (meta == null) continue
            items.push({
                id,
                kind: meta.kind,
                name: cleanName(meta.name),
                slot: meta.kind === 'cosmetic' ? (SLOTS.includes(meta.slot) ? meta.slot : 'head') : null,
                access: typeof meta.access === 'string' ? meta.access : 'public',
                source: typeof meta.source === 'string' ? meta.source : 'catalog',
                hasPreview: fs.existsSync(path.join(itemDir(id), `${id}.preview.png`))
            })
        }
        return items
    }

    // ── selecció ───────────────────────────────────────────────────────────────────────────
    function readAll() {
        try {
            const parsed = JSON.parse(fs.readFileSync(equippedFile, 'utf8'))
            return parsed != null && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {}
        } catch {
            return {}
        }
    }

    function normalize(entry) {
        const cosmetics = {}
        const raw = entry != null && typeof entry.cosmetics === 'object' && entry.cosmetics != null ? entry.cosmetics : {}
        for (const slot of SLOTS) cosmetics[slot] = typeof raw[slot] === 'string' && ID_RE.test(raw[slot]) ? raw[slot] : null
        const emotes = Array.from({ length: WHEEL_SIZE }, (_, i) => {
            const id = entry != null && Array.isArray(entry.emotes) ? entry.emotes[i] : null
            return typeof id === 'string' && ID_RE.test(id) ? id : null
        })
        return { cosmetics, emotes, settings: normalizeSettings(entry != null ? entry.settings : null) }
    }

    function getEquipped(uuid) {
        if (typeof uuid !== 'string' || uuid === '') throw new WardrobeError('INVALID_ACCOUNT')
        return normalize(readAll()[uuid])
    }

    function save(uuid, entry) {
        const all = readAll()
        all[uuid] = entry
        fs.mkdirSync(dir, { recursive: true })
        const tmp = `${equippedFile}.${process.pid}.tmp`
        fs.writeFileSync(tmp, JSON.stringify(all, null, 1))
        fs.renameSync(tmp, equippedFile)                        // el joc mai veu un fitxer a mitges
        return entry
    }

    /** Posa (o treu, amb `id = null`) un cosmètic a una ranura. Un cosmètic només va a la ranura que li correspon. */
    function setCosmetic(uuid, slot, id) {
        if (!SLOTS.includes(slot)) throw new WardrobeError('INVALID_SLOT')
        const entry = getEquipped(uuid)
        if (id != null) {
            const meta = readSidecar(id)
            if (meta == null || meta.kind !== 'cosmetic') throw new WardrobeError('NOT_FOUND')
            if ((SLOTS.includes(meta.slot) ? meta.slot : 'head') !== slot) throw new WardrobeError('WRONG_SLOT')
        }
        entry.cosmetics[slot] = id
        return save(uuid, entry)
    }

    /** Posa (o buida) un dels 8 sectors de la roda. Un emote només pot ocupar un sector. */
    function setEmote(uuid, index, id) {
        if (!Number.isInteger(index) || index < 0 || index >= WHEEL_SIZE) throw new WardrobeError('INVALID_SLOT')
        const entry = getEquipped(uuid)
        if (id != null) {
            const meta = readSidecar(id)
            if (meta == null || meta.kind !== 'emote') throw new WardrobeError('NOT_FOUND')
            entry.emotes = entry.emotes.map((other) => (other === id ? null : other))
        }
        entry.emotes[index] = id
        return save(uuid, entry)
    }

    // ── contingut del catàleg del servidor ─────────────────────────────────────────────────────
    /**
     * Instal·la (o actualitza) un element baixat del catàleg. Es comprova que el contingut és el que el catàleg declara (SHA-256) i
     * que és un model vàlid abans de tocar res; si el model canvia, la previsualització vella s'esborra (es tornarà a generar).
     * @param {{id: string, kind: 'cosmetic'|'emote', name: string, model: Buffer, sha256: string, slot?: string, attach?: string, offset?: number[], scale?: number}} input
     */
    function install({ id, kind, name, model, sha256, slot, attach, offset, scale }) {
        if (!KINDS.includes(kind)) throw new WardrobeError('INVALID_KIND')
        if (typeof id !== 'string' || !CATALOG_ID_RE.test(id)) throw new WardrobeError('INVALID_ID')
        if (typeof sha256 !== 'string' || !SHA_RE.test(sha256) || crypto.createHash('sha256').update(model).digest('hex') !== sha256) throw new WardrobeError('INVALID_MODEL')
        checkModel(model, kind)
        if (readSidecar(id) == null && catalog().length >= MAX_ITEMS) throw new WardrobeError('LIBRARY_FULL')
        const meta = { kind, name: cleanName(name), access: 'public', source: 'catalog', sha256 }
        if (kind === 'cosmetic') {
            meta.slot = SLOTS.includes(slot) ? slot : 'head'
            if (typeof attach === 'string' && BONES.includes(attach)) meta.attach = attach
            if (Array.isArray(offset) && offset.length === 3) meta.offset = offset.map((v) => finite(v, 0))
            if (typeof scale === 'number' && Number.isFinite(scale)) meta.scale = scale
        }
        const target = itemDir(id)
        const previous = readSidecar(id)
        fs.mkdirSync(target, { recursive: true })
        fs.writeFileSync(path.join(target, `${id}.bbmodel`), model)
        fs.writeFileSync(path.join(target, `${id}.hmc.json`), JSON.stringify(meta, null, 1))
        if (previous == null || previous.sha256 !== sha256) fs.rmSync(path.join(target, `${id}.preview.png`), { force: true })
        return { id, kind, name: meta.name, slot: meta.slot ?? null, access: meta.access, source: meta.source, hasPreview: fs.existsSync(path.join(target, `${id}.preview.png`)) }
    }

    /** Esborra els elements del catàleg que el servidor ja no ofereix (i els treu de les seleccions). @returns {string[]} ids esborrats */
    function removeCatalogExcept(keepIds) {
        const keep = new Set(keepIds)
        const gone = catalog().filter((i) => i.source === 'catalog' && !keep.has(i.id)).map((i) => i.id)
        for (const id of gone) removeItem(id)
        return gone
    }

    /** sha256 de l'element instal·lat (per saber si cal tornar-lo a baixar), o `null`. */
    function installedHash(id) {
        const meta = readSidecar(id)
        return meta != null && typeof meta.sha256 === 'string' ? meta.sha256 : null
    }

    /** Metadades de l'element instal·lat (nom, ranura, os, desplaçament, escala), o `null`. */
    function installedMeta(id) {
        const meta = readSidecar(id)
        return meta == null ? null : { name: meta.name, slot: meta.slot, attach: meta.attach, offset: meta.offset, scale: meta.scale }
    }

    // ── previsualitzacions (PNG quiets) ──────────────────────────────────────────────────────
    const previewFile = (id) => path.join(itemDir(id), `${id}.preview.png`)

    /** PNG de la previsualització com a data URL, o `null` si encara no n'hi ha. */
    function readPreview(id) {
        if (readSidecar(id) == null) return null
        try {
            return `data:image/png;base64,${fs.readFileSync(previewFile(id)).toString('base64')}`
        } catch {
            return null
        }
    }

    /** Desa la previsualització que ha renderitzat el visor. Només es reconeix un PNG petit i amb capçalera vàlida: el joc el carrega tal qual. */
    function savePreview(id, dataUrl) {
        if (readSidecar(id) == null) throw new WardrobeError('NOT_FOUND')
        const prefix = 'data:image/png;base64,'
        if (typeof dataUrl !== 'string' || !dataUrl.startsWith(prefix) || dataUrl.length > MAX_PREVIEW_BYTES * 2) throw new WardrobeError('INVALID_PREVIEW')
        const decoded = Buffer.from(dataUrl.slice(prefix.length), 'base64')
        if (decoded.length > MAX_PREVIEW_BYTES) throw new WardrobeError('INVALID_PREVIEW')
        let png
        try {
            // El que el joc carregarà com a textura: estructura sencera comprovada i reescrita sense metadades.
            const cleaned = PngUtil.clean(decoded, { maxWidth: MAX_PREVIEW_SIDE, maxHeight: MAX_PREVIEW_SIDE, maxBytes: MAX_PREVIEW_BYTES })
            if (cleaned.width < 16 || cleaned.height < 16) throw new Error('massa petita')
            png = cleaned.data
        } catch {
            throw new WardrobeError('INVALID_PREVIEW')
        }
        const tmp = `${previewFile(id)}.${process.pid}.tmp`
        fs.writeFileSync(tmp, png)
        fs.renameSync(tmp, previewFile(id))
    }

    /** Esborra l'element i el treu de totes les seleccions (de qualsevol compte). */
    function removeItem(id) {
        const target = itemDir(id)
        const all = readAll()
        for (const uuid of Object.keys(all)) {
            const entry = normalize(all[uuid])
            for (const slot of SLOTS) if (entry.cosmetics[slot] === id) entry.cosmetics[slot] = null
            entry.emotes = entry.emotes.map((other) => (other === id ? null : other))
            all[uuid] = { ...all[uuid], cosmetics: entry.cosmetics, emotes: entry.emotes }
        }
        fs.mkdirSync(dir, { recursive: true })
        fs.writeFileSync(equippedFile, JSON.stringify(all, null, 1))
        fs.rmSync(target, { recursive: true, force: true })
    }

    /** Canvia ajustos (només els que es passen). La tecla de la roda i la del menú no poden ser la mateixa. */
    function setSettings(uuid, patch) {
        if (patch == null || typeof patch !== 'object') throw new WardrobeError('INVALID_SETTINGS')
        const entry = getEquipped(uuid)
        const next = normalizeSettings({ ...entry.settings, ...patch })
        if (next.wheelKey === next.menuKey) throw new WardrobeError('KEY_IN_USE')
        entry.settings = next
        return save(uuid, entry)
    }

    /** Model i fitxer auxiliar d'un element, per a la previsualització 3D del launcher (el renderer no toca el disc). */
    function readItem(id) {
        const meta = readSidecar(id)
        if (meta == null) throw new WardrobeError('NOT_FOUND')
        const slot = meta.kind === 'cosmetic' ? (SLOTS.includes(meta.slot) ? meta.slot : 'head') : null
        return {
            kind: meta.kind,
            model: fs.readFileSync(path.join(itemDir(id), `${id}.bbmodel`), 'utf8'),
            attach: typeof meta.attach === 'string' && BONES.includes(meta.attach) ? meta.attach : defaultAttach(slot),
            offset: Array.isArray(meta.offset) && meta.offset.length === 3 ? meta.offset.map((v) => finite(v, 0)) : [0, 0, 0],
            scale: finite(meta.scale, 1)
        }
    }

    return { catalog, getEquipped, setCosmetic, setEmote, install, removeCatalogExcept, installedHash, installedMeta, readPreview, savePreview, removeItem, readItem, setSettings }
}

module.exports = { create, WardrobeError, SLOTS, WHEEL_SIZE, DEFAULT_SETTINGS }
