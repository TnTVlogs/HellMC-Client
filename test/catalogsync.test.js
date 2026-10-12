'use strict'
// Sincronització del catàleg (docs/client-cosmetics/20): llista validada, hash comprovat, sense xarxa no es toca res.
const assert = require('node:assert/strict')
const crypto = require('node:crypto')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const WardrobeManager = require('../app/assets/js/wardrobemanager')
const { create, cleanItem } = require('../app/assets/js/catalogsync')

const sha = (b) => crypto.createHash('sha256').update(b).digest('hex')
const hat = Buffer.from(JSON.stringify({ elements: [{}], textures: [] }))
const hat2 = Buffer.from(JSON.stringify({ elements: [{}, {}], textures: [] }))
const dance = Buffer.from(JSON.stringify({ animations: [{ name: 'dance' }] }))
const A = 'a'.repeat(12)
const B = 'b'.repeat(12)
const C = 'c'.repeat(12)

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'hellmc-catalog-'))
;(async () => {
    try {
        const wardrobe = WardrobeManager.create({ dir })
        const files = new Map()
        let list = null
        const requests = []
        const fetchFn = async (url, opts) => {
            requests.push(url)
            assert.equal(opts.redirect, 'error')
            if (url === 'https://x.test/api/catalog') {
                if (list === null) throw new Error('sense xarxa')
                return new Response(JSON.stringify(list), { status: 200 })
            }
            const key = url.replace('https://x.test', '')
            return files.has(key) ? new Response(files.get(key), { status: 200 }) : new Response('no', { status: 404 })
        }
        const logs = []
        const sync = create({ wardrobe, origin: 'https://x.test', fetchFn, log: (m) => logs.push(m) }).sync
        const url = (id, model) => `/api/catalog/items/${id}/${sha(model)}.bbmodel`
        const entry = (id, model, extra = {}) => ({ id, kind: 'cosmetic', name: 'Barret', slot: 'head', sha256: sha(model), size: model.length, url: 'https://evil.test/x', ...extra })

        // sense xarxa: no es toca res
        assert.equal((await sync()).offline, true)
        assert.deepEqual(wardrobe.catalog(), [])

        // primera sincronització: s'instal·la; la URL del servidor s'ignora (es construeix aquí)
        files.set(url(A, hat), hat)
        files.set(url(B, dance), dance)
        list = { format: 1, items: [entry(A, hat, { offset: [0, 32, 0], scale: 2 }), entry(B, dance, { kind: 'emote', name: 'Ball', slot: null })] }
        let r = await sync()
        assert.deepEqual([r.added, r.updated, r.removed, r.failed], [2, 0, 0, 0])
        assert.ok(requests.every((u) => u.startsWith('https://x.test/')), 'mai cap host del servidor')
        const items = wardrobe.catalog()
        assert.equal(items.length, 2)
        assert.equal(wardrobe.readItem(A).scale, 2)
        assert.equal(wardrobe.installedHash(A), sha(hat))

        // sense canvis: no es baixa res
        const before = requests.length
        r = await sync()
        assert.deepEqual([r.added, r.updated, r.removed, r.failed], [0, 0, 0, 0])
        assert.equal(requests.length, before + 1, 'només la llista')

        // canvi de metadades sense canvi de model: s'actualitza sense baixar el model
        list = { format: 1, items: [entry(A, hat, { name: 'Barret pirata', slot: 'face', offset: [0, 32, 0], scale: 2 }), entry(B, dance, { kind: 'emote', name: 'Ball', slot: null })] }
        r = await sync()
        assert.equal(r.updated, 1)
        assert.equal(requests.length, before + 2)
        assert.equal(wardrobe.catalog().find((i) => i.id === A).name, 'Barret pirata')
        assert.equal(wardrobe.catalog().find((i) => i.id === A).slot, 'face')

        // model nou (hash nou): es torna a baixar
        files.set(url(A, hat2), hat2)
        list = { format: 1, items: [entry(A, hat2, { name: 'Barret pirata', slot: 'face', offset: [0, 32, 0], scale: 2 }), entry(B, dance, { kind: 'emote', name: 'Ball', slot: null })] }
        r = await sync()
        assert.equal(r.updated, 1)
        assert.equal(wardrobe.installedHash(A), sha(hat2))

        // contingut que no és el declarat (servidor trampós o caché corrupta): no s'instal·la
        files.set(url(C, hat), Buffer.from('{"elements":[{},{},{}]}'))
        list.items.push(entry(C, hat))
        r = await sync()
        assert.equal(r.failed, 1)
        assert.equal(wardrobe.installedHash(C), null)
        assert.equal(wardrobe.catalog().length, 2)

        // elements invàlids es descarten; format desconegut = offline (no esborra res)
        assert.equal(cleanItem({ ...entry(A, hat), id: '../../x' }), null)
        assert.equal(cleanItem({ ...entry(A, hat), sha256: 'zz' }), null)
        assert.equal(cleanItem({ ...entry(A, hat), kind: 'altre' }), null)
        assert.equal(cleanItem({ ...entry(A, hat), size: 5e9 }), null)
        assert.equal(cleanItem({ ...entry(A, hat), slot: 'cua' }).slot, 'head')
        list = { format: 99, items: [] }
        assert.equal((await sync()).offline, true)
        assert.equal(wardrobe.catalog().length, 2)

        // el servidor deixa d'oferir un element: es retira
        list = { format: 1, items: [entry(B, dance, { kind: 'emote', name: 'Ball', slot: null })] }
        r = await sync()
        assert.equal(r.removed, 1)
        assert.deepEqual(wardrobe.catalog().map((i) => i.id), [B])

        // una sincronització alhora
        const p1 = sync()
        const p2 = sync()
        assert.equal(p1, p2)
        await p1
        console.log('catalogsync: all OK')
    } finally {
        fs.rmSync(dir, { recursive: true, force: true })
    }
})().catch((e) => { console.error(e); process.exit(1) })
