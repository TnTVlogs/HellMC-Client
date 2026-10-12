'use strict'

// Validació estricta de PNG per a tot el que el client desa o envia i que després llegeix un descodificador d'imatges (skins, textures
// de cosmètics, previsualitzacions): es recorren els blocs un per un (longitud, CRC, ordre, mida de les dades), es comprova que les dades
// comprimides s'expandeixen exactament a la mida que diu la capçalera (sense bombes de descompressió) i, quan es neteja, es REESCRIU
// el fitxer amb només els blocs necessaris: res de metadades (text, EXIF, miniatures), cap dada després de l'IEND. Sense dependències.

const zlib = require('node:zlib')

const SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
/** Blocs que sobreviuen a la neteja d'una skin o d'una imatge: els crítics i la transparència. */
const KEEP_MINIMAL = new Set(['IHDR', 'PLTE', 'IDAT', 'IEND', 'tRNS'])
/** Blocs que accepta una textura de cosmètic ja neta del servidor (color i densitat; la resta és soroll o metadades). */
const ACCEPT_TEXTURE = new Set([...KEEP_MINIMAL, 'gAMA', 'cHRM', 'sRGB', 'iCCP', 'sBIT', 'bKGD', 'pHYs'])
const MAX_CHUNKS = 2000
const CHANNELS = { 0: 1, 2: 3, 3: 1, 4: 2, 6: 4 }
const DEPTHS = { 0: [1, 2, 4, 8, 16], 2: [8, 16], 3: [1, 2, 4, 8], 4: [8, 16], 6: [8, 16] }

class PngError extends Error {
    constructor(reason) {
        super(`PNG invàlid: ${reason}`)
        this.reason = reason
    }
}

const TABLE = (() => {
    const t = new Uint32Array(256)
    for (let n = 0; n < 256; n++) {
        let c = n
        for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
        t[n] = c >>> 0
    }
    return t
})()

function crc32(buf) {
    let c = 0xffffffff
    for (let i = 0; i < buf.length; i++) c = TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8)
    return (c ^ 0xffffffff) >>> 0
}

/**
 * Comprova el PNG sencer i en torna la informació. Llança `PngError` amb el motiu.
 * @param {Buffer} buf
 * @param {{maxWidth: number, maxHeight: number, maxBytes?: number, sizes?: [number, number][], accept?: Set<string>}} limits
 *   `sizes`: si hi és, només aquestes mides exactes (skins: 64×64 i 64×32). `accept`: blocs permesos (per defecte només els mínims).
 */
function inspect(buf, limits) {
    const { maxWidth, maxHeight, maxBytes = 1024 * 1024, sizes = null, accept = KEEP_MINIMAL } = limits
    if (!Buffer.isBuffer(buf) || buf.length < 45 || buf.length > maxBytes) throw new PngError('mida del fitxer')
    if (!buf.subarray(0, 8).equals(SIGNATURE)) throw new PngError('no és un PNG')
    const chunks = []
    let pos = 8
    let header = null
    let sawPlte = false
    let sawEnd = false
    const idat = []
    // Tot el que hi hagi després de l'IEND (dades afegides, un altre fitxer…) s'ignora aquí i la neteja ho descarta.
    for (let n = 0; pos < buf.length && !sawEnd; n++) {
        if (n >= MAX_CHUNKS) throw new PngError('massa blocs')
        if (pos + 12 > buf.length) throw new PngError('truncat')
        const length = buf.readUInt32BE(pos)
        const end = pos + 12 + length
        if (length > 0x7fffffff || end > buf.length) throw new PngError('bloc fora de límits')
        const type = buf.toString('latin1', pos + 4, pos + 8)
        if (!/^[A-Za-z]{4}$/.test(type)) throw new PngError('nom de bloc invàlid')
        if (crc32(buf.subarray(pos + 4, pos + 8 + length)) !== buf.readUInt32BE(pos + 8 + length)) throw new PngError(`CRC del bloc ${type}`)
        if (n === 0 && (type !== 'IHDR' || length !== 13)) throw new PngError('falta la capçalera')
        if (n > 0 && type === 'IHDR') throw new PngError('capçalera repetida')
        // Els blocs crítics (majúscula inicial) que no són els coneguts no es poden ignorar: el fitxer és invàlid.
        if (type[0] >= 'A' && type[0] <= 'Z' && !KEEP_MINIMAL.has(type)) throw new PngError(`bloc crític desconegut ${type}`)
        if (!accept.has(type)) {
            if (type[0] >= 'A' && type[0] <= 'Z') throw new PngError(`bloc ${type} no permès`)
            // auxiliar no permès: no passa res en mode neteja (s'elimina); en mode comprovació, el fitxer no és net
            chunks.push({ type, start: pos, end, drop: true })
        } else {
            chunks.push({ type, start: pos, end, drop: false })
        }
        const body = buf.subarray(pos + 8, pos + 8 + length)
        if (type === 'IHDR') {
            const width = body.readUInt32BE(0)
            const height = body.readUInt32BE(4)
            const depth = body[8]
            const color = body[9]
            if (width < 1 || height < 1 || width > maxWidth || height > maxHeight) throw new PngError(`mida ${width}×${height} fora de límits`)
            if (sizes != null && !sizes.some(([w, h]) => w === width && h === height)) throw new PngError(`mida ${width}×${height} no permesa`)
            if (!(color in CHANNELS) || !DEPTHS[color].includes(depth)) throw new PngError('tipus de color o profunditat invàlids')
            if (body[10] !== 0 || body[11] !== 0 || body[12] > 1) throw new PngError('mètodes de compressió, filtre o entrellaçat desconeguts')
            header = { width, height, depth, color, interlaced: body[12] === 1 }
        } else if (type === 'PLTE') {
            if (sawPlte || length === 0 || length % 3 !== 0 || length > 768) throw new PngError('paleta invàlida')
            sawPlte = true
        } else if (type === 'IDAT') {
            idat.push(body)
        } else if (type === 'IEND') {
            if (length !== 0) throw new PngError('IEND amb dades')
            sawEnd = true
        }
        pos = end
    }
    if (header == null || !sawEnd || idat.length === 0) throw new PngError('incomplet')
    if (header.color === 3 && !sawPlte) throw new PngError('falta la paleta')

    // Les dades comprimides han d'expandir-se exactament a (bytes per fila + 1) × files (sense entrellaçat): res de bombes de descompressió.
    const bitsPerPixel = CHANNELS[header.color] * header.depth
    const rowBytes = Math.ceil((header.width * bitsPerPixel) / 8) + 1
    const expected = rowBytes * header.height
    const limit = header.interlaced ? expected + 7 * header.height + 64 : expected
    let raw
    try {
        raw = zlib.inflateSync(Buffer.concat(idat), { maxOutputLength: limit })
    } catch {
        throw new PngError('dades d\'imatge corruptes o massa grans')
    }
    if (!header.interlaced && raw.length !== expected) throw new PngError('les dades no coincideixen amb la mida')
    return { width: header.width, height: header.height, chunks }
}

/** Comprova el PNG i el reescriu només amb els blocs de `keep` (per defecte els mínims). Retorna el buffer net. */
function clean(buf, limits) {
    const keep = limits.keep ?? KEEP_MINIMAL
    const info = inspect(buf, { ...limits, accept: new Set([...(limits.accept ?? KEEP_MINIMAL), ...keep]) })
    const out = [SIGNATURE]
    for (const c of info.chunks) if (keep.has(c.type)) out.push(buf.subarray(c.start, c.end))
    return { data: Buffer.concat(out), width: info.width, height: info.height }
}

module.exports = { inspect, clean, crc32, PngError, SIGNATURE, KEEP_MINIMAL, ACCEPT_TEXTURE }
