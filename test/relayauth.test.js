'use strict'
// Autenticacio amb el relay (docs/pendents/plans/09): challenge -> join a Mojang -> verify -> fitxer de sessio per al runtime.
const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { create, SESSION_FILE } = require('../app/assets/js/relayauth')
const RuntimeManager = require('../app/assets/js/runtimemanager')

const SERVER_ID = 'ab'.repeat(20)
const UUID = '0123456789abcdef0123456789abcdef'
const account = { type: 'microsoft', uuid: '01234567-89ab-cdef-0123-456789abcdef', displayName: 'Steve', accessToken: 'SECRET-ACCESS-TOKEN' }

function setup(over = {}) {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'hellmc-relayauth-'))
    const calls = []
    const handlers = {
        challenge: () => ({ ok: true, status: 200, json: async () => ({ serverId: SERVER_ID }) }),
        join: () => ({ ok: true, status: 204, json: async () => ({}) }),
        verify: () => ({ ok: true, status: 200, json: async () => ({ token: 'tok.en', expiresAt: 5_000_000 }) }),
        ...over
    }
    const fetchFn = async (url, init) => {
        const body = JSON.parse(init.body)
        calls.push({ url, body, init })
        if (url.endsWith('/auth/challenge')) return handlers.challenge()
        if (url.includes('sessionserver.mojang.com') && url.endsWith('/join')) return handlers.join()
        if (url.endsWith('/auth/verify')) return handlers.verify()
        throw new Error('url inesperada ' + url)
    }
    const dataDir = path.join(root, 'userData')
    const gameDir = path.join(root, 'game')
    fs.mkdirSync(gameDir, { recursive: true })
    const ra = create({ fetchFn, dataDir, relayBase: 'https://relay.test', now: () => 1000 })
    return { root, calls, ra, dataDir, gameDir }
}

;(async () => {
    // flux feliç
    {
        const s = setup()
        try {
            assert.equal(await s.ra.prepare(s.gameDir, account), true)
            assert.equal(s.calls.length, 3)
            const [ch, join, ver] = s.calls
            assert.equal(ch.url, 'https://relay.test/auth/challenge')
            // el token d acces nomes va a Mojang, i amb el nonce del relay
            assert.equal(join.url, 'https://sessionserver.mojang.com/session/minecraft/join')
            assert.deepEqual(join.body, { accessToken: 'SECRET-ACCESS-TOKEN', selectedProfile: UUID, serverId: SERVER_ID })
            assert.equal(ver.url, 'https://relay.test/auth/verify')
            assert.ok(!JSON.stringify(ver.body).includes('SECRET-ACCESS-TOKEN'))
            assert.ok(!JSON.stringify(ch.body).includes('SECRET-ACCESS-TOKEN'))
            assert.deepEqual({ ...ver.body, installId: 'x' }, { uuid: UUID, name: 'Steve', installId: 'x', serverId: SERVER_ID })
            assert.match(ver.body.installId, /^[A-Za-z0-9_-]{8,64}$/)
            for (const c of s.calls) assert.equal(c.init.redirect, 'error')
            const session = JSON.parse(fs.readFileSync(path.join(s.gameDir, SESSION_FILE), 'utf8'))
            assert.deepEqual(session, { v: 1, url: 'wss://relay.test/ws', token: 'tok.en', expiresAt: 5_000_000 })
            // l identificador d instal.lacio es estable
            assert.equal(s.ra.installId(), s.ra.installId())
            assert.equal(s.ra.installId(), ver.body.installId)

            // el runtime rep el fitxer, no el token
            const rt = RuntimeManager.create({ dataDir: s.dataDir, clientVersion: '2.0.0', env: {}, devRuntimeDir: path.join(s.root, 'dev') })
            fs.mkdirSync(path.join(s.root, 'dev', 'modules'), { recursive: true })
            fs.writeFileSync(path.join(s.root, 'dev', 'hellmc-runtime.jar'), '')
            fs.writeFileSync(path.join(s.root, 'dev', 'modules', 'm.jar'), '')
            const args = rt.jvmArgs({ minecraftVersion: '26.3', gameDir: s.gameDir })
            assert.ok(args.includes(`-Dhellmc.relay=${path.join(s.gameDir, SESSION_FILE)}`))
            assert.ok(!args.join(' ').includes('tok.en'))
            // sense fitxer, sense argument
            s.ra.clear(s.gameDir)
            assert.ok(!fs.existsSync(path.join(s.gameDir, SESSION_FILE)))
            assert.ok(!rt.jvmArgs({ minecraftVersion: '26.3', gameDir: s.gameDir }).some((a) => a.startsWith('-Dhellmc.relay')))
        } finally {
            fs.rmSync(s.root, { recursive: true, force: true })
        }
    }

    // fallades: mai llancen, mai deixen un fitxer de sessio (ni un d antic)
    const failures = {
        'relay caigut': { challenge: () => ({ ok: false, status: 503 }) },
        'nonce invalid': { challenge: () => ({ ok: true, status: 200, json: async () => ({ serverId: 'no' }) }) },
        'Mojang rebutja el token': { join: () => ({ ok: false, status: 403 }) },
        'relay rebutja la verificacio': { verify: () => ({ ok: false, status: 401 }) },
        'token caducat': { verify: () => ({ ok: true, status: 200, json: async () => ({ token: 't.t', expiresAt: 10 }) }) },
        'resposta sense token': { verify: () => ({ ok: true, status: 200, json: async () => ({}) }) },
        'xarxa': { challenge: () => { throw new Error('offline') } }
    }
    for (const [name, over] of Object.entries(failures)) {
        const s = setup(over)
        try {
            fs.writeFileSync(path.join(s.gameDir, SESSION_FILE), '{"old":true}')
            assert.equal(await s.ra.prepare(s.gameDir, account), false, name)
            assert.ok(!fs.existsSync(path.join(s.gameDir, SESSION_FILE)), name)
        } finally {
            fs.rmSync(s.root, { recursive: true, force: true })
        }
    }

    // comptes sense token o amb UUID invalid
    {
        const s = setup()
        try {
            for (const bad of [null, {}, { ...account, accessToken: '' }, { ...account, uuid: 'zz' }]) assert.equal(await s.ra.prepare(s.gameDir, bad), false)
            assert.equal(s.calls.length, 0)
        } finally {
            fs.rmSync(s.root, { recursive: true, force: true })
        }
    }
    console.log('relayauth: all OK')
})().catch((err) => {
    console.error(err)
    process.exit(1)
})
