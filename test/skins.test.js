'use strict'
// Skins (docs/client-cosmetics/14-skins.md): validació de PNG, biblioteca local i crides a l'API de Mojang amb `fetch` simulat.
const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { create, parsePng, SkinsError, isTextureUrl, isValidMinecraftName } = require('../app/assets/js/skinsmanager')

const { png } = require('./pngfixture')
const reject = (fn, code) => assert.throws(fn, (e) => e instanceof SkinsError && e.code === code)
const rejectAsync = async (p, code) => assert.rejects(p, (e) => e instanceof SkinsError && e.code === code)

const json = (status, body) => ({ status, ok: status >= 200 && status < 300, json: async () => body, text: async () => JSON.stringify(body), arrayBuffer: async () => png(64, 64) })

async function main() {
    // ── PNG ──
    assert.deepEqual([parsePng(png(64, 64)).width, parsePng(png(64, 64)).height], [64, 64])
    assert.deepEqual([parsePng(png(64, 32)).width, parsePng(png(64, 32)).height], [64, 32])
    // estructura estricta: metadades i dades finals s'eliminen; CRC o dades trencats es rebutgen
    const { chunk } = require('./pngfixture')
    const dirty = png(64, 64, { extra: [chunk('tEXt', Buffer.from('Comment\0secret'))], trailing: Buffer.from('payload') })
    const cleaned = parsePng(dirty).data
    assert.ok(!cleaned.includes(Buffer.from('secret')) && !cleaned.includes(Buffer.from('payload')))
    reject(() => parsePng(png(64, 64, { badCrc: true })), 'INVALID_PNG')
    reject(() => parsePng(png(64, 64, { shortData: true })), 'INVALID_PNG')
    reject(() => parsePng(png(64, 64).subarray(0, 33)), 'INVALID_PNG')
    reject(() => parsePng(png(128, 128)), 'INVALID_SIZE')
    reject(() => parsePng(png(64, 48)), 'INVALID_SIZE')
    reject(() => parsePng(Buffer.from('no és un png')), 'INVALID_PNG')
    reject(() => parsePng(Buffer.alloc(2 * 1024 * 1024)), 'INVALID_PNG')

    // ── ajudants ──
    assert.equal(isTextureUrl('https://textures.minecraft.net/texture/abc'), true)
    assert.equal(isTextureUrl('http://textures.minecraft.net/texture/abc'), true, 'Mojang serveix http://textures.minecraft.net')
    assert.equal(isTextureUrl('ftp://textures.minecraft.net/texture/abc'), false)
    assert.equal(isTextureUrl('https://textures.minecraft.net.evil.com/x'), false)
    assert.equal(isTextureUrl('https://evil.com/textures.minecraft.net'), false)
    assert.equal(isValidMinecraftName('Notch_1'), true)
    assert.equal(isValidMinecraftName('../x'), false)
    assert.equal(isValidMinecraftName('a'.repeat(17)), false)

    // ── biblioteca local ──
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'hellmc-skins-'))
    try {
        const calls = []
        let token = 'tok'
        let respond = () => json(200, {})
        const fetchFn = async (url, init) => { calls.push({ url, init }); return respond(url, init) }
        const svc = create({ fetchFn, getToken: async () => token, libraryDir: path.join(dir, 'skins') })

        assert.deepEqual(svc.listLibrary(), { skins: [], selection: {} })
        const entry = svc.addToLibrary({ name: '  La meva\u0007 skin  ', variant: 'slim', png: png(64, 64), source: 'file' })
        assert.equal(entry.name, 'La meva skin')
        assert.match(entry.id, /^[0-9a-f]{12}$/)
        assert.equal(svc.listLibrary().skins.length, 1)
        assert.ok(svc.readLibraryPng(entry.id).dataUrl.startsWith('data:image/png;base64,'))
        reject(() => svc.addToLibrary({ name: 'x', variant: 'wide', png: png(64, 64) }), 'INVALID_VARIANT')
        reject(() => svc.addToLibrary({ name: 'x', variant: 'classic', png: png(10, 10) }), 'INVALID_SIZE')
        reject(() => svc.readLibraryPng('../../etc/passwd'), 'NOT_FOUND')

        svc.renameInLibrary(entry.id, 'Nom nou')
        assert.equal(svc.listLibrary().skins[0].name, 'Nom nou')
        svc.setVariantInLibrary(entry.id, 'classic')
        assert.equal(svc.listLibrary().skins[0].variant, 'classic')
        reject(() => svc.setVariantInLibrary(entry.id, 'wide'), 'INVALID_VARIANT')
        svc.setLocalSelection('uuid-offline', entry.id)
        assert.equal(svc.listLibrary().selection['uuid-offline'], entry.id)
        reject(() => svc.setLocalSelection('uuid-offline', 'aaaaaaaaaaaa'), 'NOT_FOUND')
        svc.removeFromLibrary(entry.id)
        assert.deepEqual(svc.listLibrary(), { skins: [], selection: {} })
        assert.equal(fs.existsSync(path.join(dir, 'skins', `${entry.id}.png`)), false)

        // ── perfil ──
        respond = () => json(200, {
            id: 'abc', name: 'Steve',
            skins: [{ id: 's1', state: 'ACTIVE', variant: 'SLIM', url: 'http://textures.minecraft.net/texture/1' }, { id: 's2', state: 'INACTIVE', variant: 'CLASSIC', url: 'https://evil.com/x' }],
            capes: [{ id: 'c1', state: 'INACTIVE', alias: 'Migrator', url: 'https://textures.minecraft.net/texture/2' }]
        })
        const profile = await svc.getProfile()
        assert.equal(calls.at(-1).init.headers.Authorization, 'Bearer tok')
        assert.equal(profile.skins.length, 1, 'URLs que no són de textures.minecraft.net es descarten')
        assert.deepEqual([profile.skins[0].variant, profile.skins[0].active], ['slim', true])
        assert.equal(profile.skins[0].url, 'https://textures.minecraft.net/texture/1', 'es normalitza a https')
        assert.deepEqual([profile.capes[0].alias, profile.capes[0].active], ['Migrator', false])

        // ── pujar skin ──
        respond = () => json(200, { id: 'abc', name: 'Steve', skins: [], capes: [] })
        await svc.setSkinFromPng(png(64, 64), 'classic')
        const upload = calls.at(-1)
        assert.equal(upload.init.method, 'POST')
        assert.ok(upload.init.body instanceof FormData)
        assert.equal(upload.init.body.get('variant'), 'classic')
        await rejectAsync(svc.setSkinFromPng(png(32, 32), 'classic'), 'INVALID_SIZE')

        // ── capes ──
        await svc.setActiveCape('c1c1c1c1-aaaa')
        assert.equal(calls.at(-1).init.method, 'PUT')
        assert.deepEqual(JSON.parse(calls.at(-1).init.body), { capeId: 'c1c1c1c1-aaaa' })
        await svc.setActiveCape(null)
        assert.equal(calls.at(-1).init.method, 'DELETE')
        await rejectAsync(svc.setActiveCape('../x'), 'INVALID_CAPE')

        // ── errors HTTP / sense token ──
        respond = () => json(429, {})
        await rejectAsync(svc.getProfile(), 'RATE_LIMITED')
        respond = () => json(401, {})
        await rejectAsync(svc.getProfile(), 'NO_TOKEN')
        respond = () => json(400, { error: 'x' })
        await rejectAsync(svc.setSkinFromPng(png(64, 64), 'slim'), 'REJECTED')
        token = null
        const before = calls.length
        await rejectAsync(svc.getProfile(), 'NO_TOKEN')
        assert.equal(calls.length, before, 'sense token no es fa cap petició')
        token = 'tok'
        const failing = create({ fetchFn: async () => { throw new Error('boom') }, getToken: async () => 'tok', libraryDir: path.join(dir, 'x') })
        await rejectAsync(failing.getProfile(), 'NETWORK')

        // ── textures: només de textures.minecraft.net ──
        await rejectAsync(svc.fetchTexture('https://evil.com/a.png'), 'INVALID_URL')
        respond = () => json(200, {})
        assert.ok((await svc.fetchTexture('https://textures.minecraft.net/texture/9')).dataUrl.startsWith('data:image/png'))
        assert.equal(calls.at(-1).init.headers.Authorization, undefined, 'les textures no duen el token')

        // ── importar per nom ──
        await rejectAsync(svc.lookupByName('../etc'), 'INVALID_NAME')
        const texturesValue = Buffer.from(JSON.stringify({ textures: { SKIN: { url: 'http://textures.minecraft.net/texture/5', metadata: { model: 'slim' } }, CAPE: { url: 'https://textures.minecraft.net/texture/6' } } })).toString('base64')
        respond = (url) => url.startsWith('https://api.mojang.com')
            ? json(200, { id: '0123456789abcdef0123456789abcdef', name: 'Notch' })
            : json(200, { properties: [{ name: 'textures', value: texturesValue }] })
        const found = await svc.lookupByName('notch')
        assert.deepEqual(found, { name: 'Notch', skinUrl: 'https://textures.minecraft.net/texture/5', variant: 'slim', capeUrl: 'https://textures.minecraft.net/texture/6' })
        assert.equal(calls.at(-1).init.headers.Authorization, undefined, 'les consultes públiques no duen el token')
        respond = (url) => url.startsWith('https://api.mojang.com') ? json(200, { id: '0123456789abcdef0123456789abcdef', name: 'x' }) : json(200, { properties: [] })
        await rejectAsync(svc.lookupByName('x'), 'NOT_FOUND')
    } finally {
        fs.rmSync(dir, { recursive: true, force: true })
    }
    console.log('skins: all OK')
}
main().catch((err) => { console.error(err); process.exit(1) })
