'use strict'
// Armari (docs/client-cosmetics/17-armari-i-seleccio.md): catàleg local, selecció per compte i contracte equipped.json.
const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const crypto = require('node:crypto')
const { create, WardrobeError } = require('../app/assets/js/wardrobemanager')
const { png, chunk } = require('./pngfixture')

const fail = (fn, code) => assert.throws(fn, (e) => e instanceof WardrobeError && e.code === code)
const hat = Buffer.from(JSON.stringify({ elements: [{}], textures: [] }))
const dance = Buffer.from(JSON.stringify({ animations: [{ name: 'dance' }] }))

const sha = (b) => crypto.createHash('sha256').update(b).digest('hex')
const newId = () => crypto.randomBytes(6).toString('hex')

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'hellmc-wardrobe-'))
try {
    const w = create({ dir })
    // el contingut arriba del catàleg del servidor (`catalogsync.js`): id i hash els posa el servidor
    const put = (o) => w.install({ id: newId(), sha256: sha(o.model), ...o })
    const uuid = '11111111-2222-3333-4444-555555555555'

    // buit
    assert.deepEqual(w.catalog(), [])
    const empty = w.getEquipped(uuid)
    assert.equal(empty.emotes.length, 8)
    assert.ok(empty.emotes.every((e) => e === null))
    assert.deepEqual(Object.keys(empty.cosmetics), ['head', 'face', 'back', 'body', 'feet'])

    // importar
    const pirate = put({ kind: 'cosmetic', name: 'Barret', model: hat, slot: 'head', offset: [0, 32, 0], scale: 2 })
    const wave = put({ kind: 'emote', name: 'Saluda', model: dance })
    const wings = put({ kind: 'cosmetic', name: 'Ales', model: hat, slot: 'back', attach: 'body' })
    assert.equal(w.catalog().length, 3)
    const side = JSON.parse(fs.readFileSync(path.join(dir, 'cache', pirate.id, `${pirate.id}.hmc.json`), 'utf8'))
    assert.deepEqual(side, { kind: 'cosmetic', name: 'Barret', access: 'public', source: 'catalog', sha256: sha(hat), slot: 'head', offset: [0, 32, 0], scale: 2 })
    fail(() => put({ kind: 'cosmetic', name: 'x', model: Buffer.from('no és json') }), 'INVALID_MODEL')
    fail(() => put({ kind: 'cosmetic', name: 'x', model: dance }), 'INVALID_MODEL')       // un emote no és un cosmètic
    fail(() => put({ kind: 'emote', name: 'x', model: hat }), 'INVALID_MODEL')
    fail(() => put({ kind: 'altre', name: 'x', model: hat }), 'INVALID_KIND')
    fail(() => w.install({ id: newId(), kind: 'cosmetic', name: 'x', model: hat, sha256: sha(dance) }), 'INVALID_MODEL')   // el contingut no és el que el catàleg declara
    fail(() => w.install({ id: '../fora', kind: 'cosmetic', name: 'x', model: hat, sha256: sha(hat) }), 'INVALID_ID')
    fail(() => w.install({ id: 'ABCDEF123456', kind: 'cosmetic', name: 'x', model: hat, sha256: sha(hat) }), 'INVALID_ID')

    // lectura per a la previsualització
    const read = w.readItem(pirate.id)
    assert.equal(read.kind, 'cosmetic')
    assert.equal(read.attach, 'head')
    assert.deepEqual(read.offset, [0, 32, 0])
    assert.equal(read.scale, 2)
    assert.equal(w.readItem(wings.id).attach, 'body')
    assert.equal(w.readItem(wave.id).kind, 'emote')
    fail(() => w.readItem('no-existeix'), 'NOT_FOUND')

    // equipar cosmètics
    w.setCosmetic(uuid, 'head', pirate.id)
    w.setCosmetic(uuid, 'back', wings.id)
    fail(() => w.setCosmetic(uuid, 'feet', pirate.id), 'WRONG_SLOT')
    fail(() => w.setCosmetic(uuid, 'head', wave.id), 'NOT_FOUND')
    fail(() => w.setCosmetic(uuid, 'head', '../fora'), 'NOT_FOUND')
    fail(() => w.setCosmetic(uuid, 'cap', null), 'INVALID_SLOT')
    assert.equal(w.getEquipped(uuid).cosmetics.head, pirate.id)

    // emotes: un sol sector per emote
    w.setEmote(uuid, 3, wave.id)
    w.setEmote(uuid, 5, wave.id)
    const e = w.getEquipped(uuid).emotes
    assert.equal(e[3], null)
    assert.equal(e[5], wave.id)
    fail(() => w.setEmote(uuid, 8, wave.id), 'INVALID_SLOT')
    fail(() => w.setEmote(uuid, 0, pirate.id), 'NOT_FOUND')

    // ajustos
    assert.deepEqual(w.getEquipped(uuid).settings, { hideOthers: false, maxDistance: 32, autoCamera: true, wheelKey: 'B', menuKey: 'N' })
    w.setSettings(uuid, { hideOthers: true, maxDistance: 1000, wheelKey: 'v' })
    assert.deepEqual(w.getEquipped(uuid).settings, { hideOthers: true, maxDistance: 128, autoCamera: true, wheelKey: 'V', menuKey: 'N' })
    fail(() => w.setSettings(uuid, { menuKey: 'v' }), 'KEY_IN_USE')
    w.setSettings(uuid, { maxDistance: -5, wheelKey: '7' })
    assert.equal(w.getEquipped(uuid).settings.maxDistance, 8)
    assert.equal(w.getEquipped(uuid).settings.wheelKey, 'B')
    assert.equal(w.getEquipped(uuid).cosmetics.head, pirate.id)         // els ajustos no toquen la resta

    // textura incrustada: ha d'arribar en forma neta (la que deixa el panell); amb metadades o trencada, el model es rebutja
    const { clean, ACCEPT_TEXTURE } = require('../app/assets/js/pngutil')
    const texLimits = { maxWidth: 256, maxHeight: 256, accept: ACCEPT_TEXTURE, keep: ACCEPT_TEXTURE }
    const modelWith = (b) => Buffer.from(JSON.stringify({ elements: [{}], textures: [{ source: 'data:image/png;base64,' + b.toString('base64') }] }))
    const cleanTex = clean(png(64, 64), texLimits).data
    put({ kind: 'cosmetic', name: 'Textura neta', model: modelWith(cleanTex), slot: 'head' })
    fail(() => put({ kind: 'cosmetic', name: 'x', model: modelWith(png(64, 64, { extra: [chunk('tEXt', Buffer.from('a\0b'))] })), slot: 'head' }), 'INVALID_MODEL')
    fail(() => put({ kind: 'cosmetic', name: 'x', model: modelWith(png(64, 64, { badCrc: true })), slot: 'head' }), 'INVALID_MODEL')
    fail(() => put({ kind: 'cosmetic', name: 'x', model: Buffer.from(JSON.stringify({ elements: [{}], textures: [{ source: 'https://exemple.com/a.png' }] })), slot: 'head' }), 'INVALID_MODEL')
    fail(() => put({ kind: 'cosmetic', name: 'x', model: modelWith(png(512, 512)), slot: 'head' }), 'INVALID_MODEL')
    for (const extra of w.catalog().filter((i) => i.name === 'Textura neta')) w.removeItem(extra.id)

    // previsualitzacions: només un PNG petit i vàlid; en canviar el model s'esborra
    const tinyPng = (w2, h2, opts) => 'data:image/png;base64,' + png(w2, h2, opts).toString('base64')
    assert.equal(w.readPreview(pirate.id), null)
    w.savePreview(pirate.id, tinyPng(128, 128))
    assert.ok(w.readPreview(pirate.id).startsWith('data:image/png;base64,'))
    assert.equal(w.catalog().find((i) => i.id === pirate.id).hasPreview, true)
    fail(() => w.savePreview(pirate.id, 'data:image/png;base64,AAAA'), 'INVALID_PREVIEW')
    fail(() => w.savePreview(pirate.id, tinyPng(4096, 4096)), 'INVALID_PREVIEW')
    fail(() => w.savePreview(pirate.id, tinyPng(128, 128, { badCrc: true })), 'INVALID_PREVIEW')
    fail(() => w.savePreview(pirate.id, tinyPng(8, 8)), 'INVALID_PREVIEW')
    w.savePreview(pirate.id, tinyPng(128, 128, { extra: [chunk('tEXt', Buffer.from('k\0secret'))], trailing: Buffer.from('payload') }))
    const stored = fs.readFileSync(path.join(dir, 'cache', pirate.id, `${pirate.id}.preview.png`))
    assert.ok(!stored.includes(Buffer.from('secret')) && !stored.includes(Buffer.from('payload')), 'la imatge desada va neta')
    fail(() => w.savePreview(pirate.id, 'data:image/svg+xml;base64,PHN2Zy8+'), 'INVALID_PREVIEW')
    fail(() => w.savePreview(pirate.id, 'https://exemple.com/x.png'), 'INVALID_PREVIEW')
    fail(() => w.savePreview('0123456789ab', tinyPng(128, 128)), 'NOT_FOUND')
    const hat2 = Buffer.from(JSON.stringify({ elements: [{}, {}], textures: [] }))
    w.install({ id: pirate.id, kind: 'cosmetic', name: 'Barret', model: hat, sha256: sha(hat), slot: 'head' })
    assert.ok(w.readPreview(pirate.id) != null, 'mateix hash: la previsualització es manté')
    assert.equal(w.installedHash(pirate.id), sha(hat))
    w.install({ id: pirate.id, kind: 'cosmetic', name: 'Barret', model: hat2, sha256: sha(hat2), slot: 'head', offset: [0, 32, 0], scale: 2 })
    assert.equal(w.readPreview(pirate.id), null, 'model nou: previsualització vella fora')

    // el servidor deixa d'oferir elements: es retiren (i de la selecció)
    const gone = put({ kind: 'cosmetic', name: 'Temporal', model: hat, slot: 'face' })
    w.setCosmetic(uuid, 'face', gone.id)
    assert.deepEqual(w.removeCatalogExcept([pirate.id, wave.id, wings.id]), [gone.id])
    assert.equal(w.getEquipped(uuid).cosmetics.face, null)

    // per compte
    assert.equal(w.getEquipped('altre-compte').cosmetics.head, null)

    // contracte del fitxer: clau = uuid, ids o null
    const raw = JSON.parse(fs.readFileSync(path.join(dir, 'equipped.json'), 'utf8'))
    assert.equal(raw[uuid].cosmetics.head, pirate.id)
    assert.equal(raw[uuid].emotes[5], wave.id)
    assert.equal(fs.readdirSync(dir).filter((f) => f.endsWith('.tmp')).length, 0)

    // un element sense model no surt al catàleg; un id no vàlid dins el fitxer s'ignora
    fs.rmSync(path.join(dir, 'cache', wings.id, `${wings.id}.bbmodel`))
    assert.equal(w.catalog().length, 2)
    fs.writeFileSync(path.join(dir, 'equipped.json'), JSON.stringify({ [uuid]: { cosmetics: { head: '../../x' }, emotes: ['../y', 7] } }))
    assert.equal(w.getEquipped(uuid).cosmetics.head, null)
    assert.ok(w.getEquipped(uuid).emotes.every((id) => id === null))
    fs.writeFileSync(path.join(dir, 'equipped.json'), '{trencat')
    assert.equal(w.getEquipped(uuid).cosmetics.head, null)

    // esborrar: treu l'element de la selecció
    w.setCosmetic(uuid, 'head', pirate.id)
    w.removeItem(pirate.id)
    assert.equal(w.getEquipped(uuid).cosmetics.head, null)
    assert.ok(!fs.existsSync(path.join(dir, 'cache', pirate.id)))
    fail(() => w.removeItem('..'), 'INVALID_ID')
    console.log('wardrobe: all OK')
} finally {
    fs.rmSync(dir, { recursive: true, force: true })
}
