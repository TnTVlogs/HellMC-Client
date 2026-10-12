'use strict'
// PNG sintètics VÀLIDS per a les proves (estructura completa: CRC, IDAT que expandeix a la mida exacta) amb la possibilitat de
// fer-hi malifetes (blocs de text, dades al final, CRC trencat…). No és un codificador general: només píxels RGBA opacs d'un color.
const zlib = require('node:zlib')
const { crc32 } = require('../app/assets/js/pngutil')

const SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])

function chunk(type, data = Buffer.alloc(0), { badCrc = false } = {}) {
    const head = Buffer.alloc(8)
    head.writeUInt32BE(data.length, 0)
    head.write(type, 4, 'latin1')
    const crc = Buffer.alloc(4)
    crc.writeUInt32BE((crc32(Buffer.concat([head.subarray(4), data])) ^ (badCrc ? 1 : 0)) >>> 0, 0)
    return Buffer.concat([head, data, crc])
}

/**
 * @param {number} width
 * @param {number} height
 * @param {{extra?: Buffer[], trailing?: Buffer, badCrc?: boolean, shortData?: boolean, color?: number}} [options]
 *   `extra`: blocs afegits entre IHDR i IDAT; `trailing`: bytes després de l'IEND.
 */
function png(width, height, { extra = [], trailing = Buffer.alloc(0), badCrc = false, shortData = false } = {}) {
    const ihdr = Buffer.alloc(13)
    ihdr.writeUInt32BE(width, 0)
    ihdr.writeUInt32BE(height, 4)
    ihdr[8] = 8
    ihdr[9] = 6                                           // RGBA de 8 bits
    const rowBytes = width * 4 + 1
    const raw = Buffer.alloc(rowBytes * height)
    for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) raw.writeUInt32BE(0x336699ff, y * rowBytes + 1 + x * 4)
    const idat = zlib.deflateSync(shortData ? raw.subarray(0, raw.length - rowBytes) : raw)
    return Buffer.concat([SIGNATURE, chunk('IHDR', ihdr, { badCrc }), ...extra, chunk('IDAT', idat), chunk('IEND'), trailing])
}

module.exports = { png, chunk, SIGNATURE }
