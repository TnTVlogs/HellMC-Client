'use strict'
// Skins dels amics per al joc: nomes els demanats, caché de 24 h, neteja del que ja no cal, baixades d'una en una.
const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { create, TTL_MS } = require('../app/assets/js/friendavatars')

const U = (c) => c.repeat(32)
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

;(async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'hellmc-friendavatars-'))
    try {
        const dir = path.join(root, 'avatars')
        let clock = Date.now()
        const calls = []
        let active = 0
        let maxActive = 0
        const skins = { [U('a')]: Buffer.from('PNG-A'), [U('b')]: Buffer.from('PNG-B') }
        const fa = create({
            getSkin: async (uuid) => {
                calls.push(uuid)
                active++
                maxActive = Math.max(maxActive, active)
                await sleep(5)
                active--
                if (uuid === U('c')) throw new Error('mojang caigut')
                return skins[uuid] ?? null
            },
            dir,
            spacingMs: 1,
            now: () => clock
        })

        // baixa els demanats i ignora el que no és un uuid
        fa.sync([U('a'), U('b'), U('c'), 'no-uuid', '../x', U('d')])
        await sleep(120)
        assert.deepEqual(fs.readdirSync(dir).sort(), [`${U('a')}.png`, `${U('b')}.png`], 'nomes les skins que han arribat')
        assert.equal(fs.readFileSync(path.join(dir, `${U('a')}.png`), 'utf8'), 'PNG-A')
        assert.deepEqual([...calls].sort(), [U('a'), U('b'), U('c'), U('d')].sort(), 'no es demana res d\'invalid')
        assert.equal(maxActive, 1, 'baixades d\'una en una')

        // una segona sincronitzacio no repeteix res (fresc al disc o ja intentat en aquesta sessio)
        const before = calls.length
        fa.sync([U('a'), U('b'), U('c'), U('d')])
        await sleep(60)
        assert.equal(calls.length, before, 'sense peticions repetides')

        // els que ja no hi son s'esborren (ex-amics, bloquejats); un fitxer tmp perdut tambe
        fs.writeFileSync(path.join(dir, `${U('e')}.png.tmp`), 'x')
        fa.sync([U('a')])
        await sleep(30)
        assert.deepEqual(fs.readdirSync(dir), [`${U('a')}.png`])

        // passades 24 h, es torna a demanar (la skin pot haver canviat); amb una llista buida s'esborra tot
        const fa2 = create({ getSkin: async (u) => { calls.push('2:' + u); return Buffer.from('NOU') }, dir, spacingMs: 1, now: () => clock + TTL_MS + 1000 })
        fa2.sync([U('a')])
        await sleep(40)
        assert.equal(fs.readFileSync(path.join(dir, `${U('a')}.png`), 'utf8'), 'NOU')
        fa2.sync([])
        await sleep(20)
        assert.deepEqual(fs.readdirSync(dir), [])

        // entrades dolentes no llancen
        fa.sync(undefined)
        fa.sync('hola')
        console.log('friendavatars: all OK')
    } finally {
        fs.rmSync(root, { recursive: true, force: true })
    }
})().catch((err) => { console.error(err); process.exit(1) })
