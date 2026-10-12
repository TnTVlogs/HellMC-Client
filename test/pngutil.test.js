'use strict'
// Validació estricta de PNG: estructura, CRC, mides, bombes de descompressió i neteja de metadades.
const assert = require('node:assert/strict')
const zlib = require('node:zlib')
const { inspect, clean, PngError, ACCEPT_TEXTURE } = require('../app/assets/js/pngutil')
const { png, chunk } = require('./pngfixture')

const limits = { maxWidth: 64, maxHeight: 64 }
const bad = (fn, re) => assert.throws(fn, (e) => e instanceof PngError && (re == null || re.test(e.reason)))

// vàlid
assert.deepEqual({ w: inspect(png(64, 64), limits).width, h: inspect(png(64, 32), limits).height }, { w: 64, h: 32 })

// neteja: fora metadades i dades finals; el resultat torna a ser vàlid i idèntic en repetir-ho
const dirty = png(64, 64, { extra: [chunk('tEXt', Buffer.from('Comment\0secret')), chunk('eXIf', Buffer.from('gps')), chunk('tIME', Buffer.alloc(7))], trailing: Buffer.from('payload') })
const out = clean(dirty, limits)
assert.ok(!out.data.includes(Buffer.from('secret')) && !out.data.includes(Buffer.from('payload')))
assert.ok(out.data.length < dirty.length)
assert.deepEqual(clean(out.data, limits).data, out.data)

// rebutjos
bad(() => inspect(Buffer.from('no és un png'), limits), /mida del fitxer/)
bad(() => inspect(Buffer.alloc(100), limits), /no és un PNG/)
bad(() => inspect(png(128, 128), limits), /fora de límits/)
bad(() => inspect(png(64, 48), { ...limits, sizes: [[64, 64], [64, 32]] }), /no permesa/)
bad(() => inspect(png(64, 64, { badCrc: true }), limits), /CRC/)
bad(() => inspect(png(64, 64).subarray(0, 60), limits), /truncat|fora de límits|incomplet|CRC/)
bad(() => inspect(png(64, 64, { shortData: true }), limits), /no coincideixen/)
bad(() => inspect(png(64, 64, { extra: [chunk('XYZW', Buffer.alloc(4))] }), limits), /crític desconegut/)
bad(() => inspect(png(64, 64, { extra: [chunk('IHDR', Buffer.alloc(13))] }), limits), /repetida/)
bad(() => inspect(png(64, 64, { extra: [chunk('PLTE', Buffer.alloc(4))] }), limits), /paleta/)
// IEND no és l'últim bloc
const trailingChunk = Buffer.concat([png(64, 64), chunk('tEXt', Buffer.from('x\0y'))])
assert.ok(!clean(trailingChunk, limits).data.includes(Buffer.from('tEXt')), "tot el que ve després de l'IEND es descarta")
// bomba de descompressió: dades que s'expandeixen molt més del que diu la capçalera
const bomb = (() => {
    const base = png(64, 64)
    const huge = zlib.deflateSync(Buffer.alloc(50 * 1024 * 1024))
    const parts = [base.subarray(0, 33), chunk('IDAT', huge), chunk('IEND')]
    return Buffer.concat(parts)
})()
bad(() => inspect(bomb, { ...limits, maxBytes: 2 * 1024 * 1024 }), /corruptes o massa grans/)

// texturas de cosmètic: forma canònica (el que deixa el panell) passa; amb metadades, no és idèntica a la seva versió neta
const texture = clean(png(64, 64), { maxWidth: 256, maxHeight: 256, accept: ACCEPT_TEXTURE, keep: ACCEPT_TEXTURE }).data
assert.deepEqual(clean(texture, { maxWidth: 256, maxHeight: 256, accept: ACCEPT_TEXTURE, keep: ACCEPT_TEXTURE }).data, texture)
const withText = png(64, 64, { extra: [chunk('tEXt', Buffer.from('a\0b'))] })
assert.notDeepEqual(clean(withText, { maxWidth: 256, maxHeight: 256, accept: ACCEPT_TEXTURE, keep: ACCEPT_TEXTURE }).data, withText)

console.log('pngutil: all OK')
