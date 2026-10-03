'use strict'
// Llista de servidors de Minecraft (`servers.dat`): en jugar a un servidor del client, s'hi afegeix si encara no hi és,
// perquè el jugador el tingui a «Multijugador» (i, en versions amb dades compartides, a totes les versions: el fitxer
// és el mateix per a totes, vegeu `datasharing.js`).
//
// Format: NBT sense comprimir (big-endian). Arrel = compound sense nom amb una llista `servers` de compounds
// `{ ip, name, icon?, hidden?, acceptTextures? … }`. Es llegeix i es torna a escriure tot l'arbre sense perdre cap
// etiqueta que no coneguem; les cadenes es conserven com a bytes (Java les escriu en «UTF-8 modificat», que no sempre
// coincideix amb UTF-8 normal — p. ex. emojis) i només es descodifiquen per comparar l'adreça.
//
// **Important**: s'escriu al mateix fitxer (truncar + escriure), mai amb «escriure a un temporal i canviar-li el nom»:
// això trencaria l'enllaç dur (`fs.linkSync`) amb què es comparteix entre versions.

const fs = require('node:fs')
const path = require('node:path')

const TAG = { END: 0, BYTE: 1, SHORT: 2, INT: 3, LONG: 4, FLOAT: 5, DOUBLE: 6, BYTE_ARRAY: 7, STRING: 8, LIST: 9, COMPOUND: 10, INT_ARRAY: 11, LONG_ARRAY: 12 }

// ── Lectura ──────────────────────────────────────────────────────────────────────────────────────

function readPayload(buf, state, type) {
    switch (type) {
        case TAG.BYTE: return take(buf, state, 1)
        case TAG.SHORT: return take(buf, state, 2)
        case TAG.INT: return take(buf, state, 4)
        case TAG.LONG: return take(buf, state, 8)
        case TAG.FLOAT: return take(buf, state, 4)
        case TAG.DOUBLE: return take(buf, state, 8)
        case TAG.BYTE_ARRAY: { const n = buf.readInt32BE(state.pos); return take(buf, state, 4 + n) }
        case TAG.STRING: { const n = buf.readUInt16BE(state.pos); return take(buf, state, 2 + n) }
        case TAG.INT_ARRAY: { const n = buf.readInt32BE(state.pos); return take(buf, state, 4 + 4 * n) }
        case TAG.LONG_ARRAY: { const n = buf.readInt32BE(state.pos); return take(buf, state, 4 + 8 * n) }
        case TAG.LIST: {
            const elementType = buf.readUInt8(state.pos)
            const length = buf.readInt32BE(state.pos + 1)
            state.pos += 5
            const items = []
            for (let i = 0; i < length; i++) items.push(readPayload(buf, state, elementType))
            return { elementType, items }
        }
        case TAG.COMPOUND: {
            const entries = []
            for (;;) {
                const childType = buf.readUInt8(state.pos++)
                if (childType === TAG.END) break
                const nameLength = buf.readUInt16BE(state.pos)
                const name = take(buf, state, 2 + nameLength).subarray(2)
                entries.push({ type: childType, name, value: readPayload(buf, state, childType) })
            }
            return entries
        }
        default: throw new Error(`Etiqueta NBT desconeguda: ${type}`)
    }
}

/** Els tipus plans es guarden com a `Buffer` tal com són (incloent-hi la longitud en cadenes i arrays). */
function take(buf, state, n) {
    if (state.pos + n > buf.length) throw new Error('NBT truncat')
    const out = buf.subarray(state.pos, state.pos + n)
    state.pos += n
    return out
}

function parse(buf) {
    const state = { pos: 0 }
    const rootType = buf.readUInt8(state.pos++)
    if (rootType !== TAG.COMPOUND) throw new Error('L\'arrel de servers.dat no és un compound')
    const nameLength = buf.readUInt16BE(state.pos)
    const rootName = take(buf, state, 2 + nameLength).subarray(2)
    return { name: rootName, entries: readPayload(buf, state, TAG.COMPOUND) }
}

// ── Escriptura ───────────────────────────────────────────────────────────────────────────────────

function writePayload(out, type, value) {
    switch (type) {
        case TAG.LIST: {
            const head = Buffer.alloc(5)
            head.writeUInt8(value.elementType, 0)
            head.writeInt32BE(value.items.length, 1)
            out.push(head)
            for (const item of value.items) writePayload(out, value.elementType, item)
            return
        }
        case TAG.COMPOUND:
            for (const entry of value) writeEntry(out, entry)
            out.push(Buffer.from([TAG.END]))
            return
        default:
            out.push(value)
    }
}

function writeEntry(out, entry) {
    const head = Buffer.alloc(3)
    head.writeUInt8(entry.type, 0)
    head.writeUInt16BE(entry.name.length, 1)
    out.push(head, entry.name)
    writePayload(out, entry.type, entry.value)
}

function serialize(root) {
    const out = []
    writeEntry(out, { type: TAG.COMPOUND, name: root.name, value: root.entries })
    return Buffer.concat(out)
}

// ── Cadenes («UTF-8 modificat» de Java) ──────────────────────────────────────────────────────────

/** Codifica com Java: NUL com `C0 80` i els caràcters fora del BMP com dos substituts de 3 bytes cadascun. */
function encodeModifiedUtf8(str) {
    const bytes = []
    for (let i = 0; i < str.length; i++) {
        const c = str.charCodeAt(i)
        if (c !== 0 && c < 0x80) bytes.push(c)
        else if (c < 0x800) bytes.push(0xc0 | (c >> 6), 0x80 | (c & 0x3f))
        else bytes.push(0xe0 | (c >> 12), 0x80 | ((c >> 6) & 0x3f), 0x80 | (c & 0x3f))
    }
    return Buffer.from(bytes)
}

function stringPayload(str) {
    const body = encodeModifiedUtf8(str)
    const head = Buffer.alloc(2)
    head.writeUInt16BE(body.length, 0)
    return Buffer.concat([head, body])
}

const stringEntry = (name, value) => ({ type: TAG.STRING, name: Buffer.from(name, 'utf8'), value: stringPayload(value) })

// ── API ──────────────────────────────────────────────────────────────────────────────────────────

/** Adreça comparable: minúscules, sense el port per defecte i sense `.` final. */
function normalizeAddress(address) {
    return String(address).trim().toLowerCase().replace(/\.(?=:|$)/, '').replace(/:25565$/, '')
}

function readIp(serverCompound) {
    const ip = serverCompound.find((e) => e.type === TAG.STRING && e.name.toString('utf8') === 'ip')
    return ip ? ip.value.subarray(2).toString('utf8') : null
}

/**
 * Afegeix `{ name, address }` a `<gameDir>/servers.dat` si cap entrada té ja aquesta adreça.
 * Mai llança: si el fitxer és corrupte o no es pot escriure, no es toca res i es retorna el motiu.
 * @returns {{ status: 'added' | 'exists' | 'skipped', reason?: string }}
 */
function ensureServer(gameDir, server) {
    if (server == null || !server.address || !server.name) return { status: 'skipped', reason: 'sense servidor' }
    const file = path.join(gameDir, 'servers.dat')
    try {
        let root
        if (fs.existsSync(file) && fs.statSync(file).size > 0) {
            root = parse(fs.readFileSync(file))
        } else {
            root = { name: Buffer.alloc(0), entries: [] }
        }
        let list = root.entries.find((e) => e.type === TAG.LIST && e.name.toString('utf8') === 'servers')
        if (list == null) {
            list = { type: TAG.LIST, name: Buffer.from('servers', 'utf8'), value: { elementType: TAG.COMPOUND, items: [] } }
            root.entries.push(list)
        }
        if (list.value.elementType !== TAG.COMPOUND && list.value.items.length > 0) return { status: 'skipped', reason: 'format inesperat' }
        list.value.elementType = TAG.COMPOUND

        const wanted = normalizeAddress(server.address)
        if (list.value.items.some((item) => { const ip = readIp(item); return ip != null && normalizeAddress(ip) === wanted })) {
            return { status: 'exists' }
        }
        list.value.items.push([stringEntry('ip', server.address), stringEntry('name', server.name)])

        // Escriu al mateix fitxer (conserva l'enllaç dur de dades compartides).
        fs.mkdirSync(gameDir, { recursive: true })
        fs.writeFileSync(file, serialize(root))
        return { status: 'added' }
    } catch (err) {
        return { status: 'skipped', reason: err instanceof Error ? err.message : String(err) }
    }
}

module.exports = { ensureServer, normalizeAddress, parse, serialize, TAG }
