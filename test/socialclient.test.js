'use strict'
// Client social del launcher (plans/11): connexio, estat, accions, reconnexio i validacio de les accions del renderer.
const assert = require('node:assert/strict')
const { create, buildMessage } = require('../app/assets/js/socialclient')

const U = (c) => c.repeat(32)

class FakeWS {
    static all = []
    constructor(url) {
        this.url = url
        this.readyState = 0
        this.sent = []
        FakeWS.all.push(this)
        queueMicrotask(() => { this.readyState = 1; this.onopen && this.onopen() })
    }
    send(s) { this.sent.push(JSON.parse(s)) }
    close() { this.readyState = 3; this.onclose && this.onclose() }
    push(msg) { this.onmessage && this.onmessage({ data: JSON.stringify(msg) }) }
    last(t) { return this.sent.filter((m) => m.t === t).at(-1) }
}
const tick = (ms = 5) => new Promise((r) => setTimeout(r, ms))

;(async () => {
    // validacio de les accions
    assert.deepEqual(buildMessage('add', { name: 'Bob' }), { t: 'friend_add', name: 'Bob' })
    assert.deepEqual(buildMessage('add', { code: 'ABCD2345' }), { t: 'friend_add', code: 'ABCD2345' })
    assert.equal(buildMessage('add', { name: '' }), null)
    assert.equal(buildMessage('add', { name: 'x'.repeat(40) }), null)
    assert.equal(buildMessage('add', { name: 5 }), null)
    assert.equal(buildMessage('respond', { uuid: 'zz', accept: true }), null)
    assert.deepEqual(buildMessage('respond', { uuid: U('a'), accept: false }), { t: 'friend_respond', uuid: U('a'), accept: false })
    assert.equal(buildMessage('respond', { uuid: U('a'), accept: 'si' }), null)
    assert.deepEqual(buildMessage('block', { uuid: U('b') }), { t: 'friend_block', uuid: U('b') })
    assert.equal(buildMessage('block', { uuid: '../x' }), null)
    assert.deepEqual(buildMessage('settings', { status: 'busy', hideServer: true }), { t: 'social_settings', status: 'busy', hideServer: true })
    assert.equal(buildMessage('settings', { status: 'dormit' }), null)
    assert.equal(buildMessage('settings', {}), null)
    assert.equal(buildMessage('hack', {}), null)
    assert.equal(buildMessage('add', undefined), null)

    // connexio, estat i accions
    let wanted = true
    let auths = 0
    const events = []
    const c = create({
        authenticate: async () => { auths++; return { token: 'TOK', expiresAt: Date.now() + 12 * 3600000 } },
        wanted: () => wanted,
        url: 'wss://relay.example/ws',
        WebSocketImpl: FakeWS,
        onEvent: (e) => events.push(e),
        backoffMs: [20]
    })
    assert.equal(c.getState().phase, 'off')
    c.start()
    await tick()
    const ws = FakeWS.all[0]
    assert.equal(ws.url, 'wss://relay.example/ws')
    assert.deepEqual(ws.last('hello'), { t: 'hello', v: 1, token: 'TOK', clientVersion: 'launcher', mc: '' })
    assert.equal(c.getState().phase, 'connecting')
    ws.push({ t: 'ready', v: 1, uuid: U('a'), maxPlayers: 200 })
    assert.equal(c.getState().phase, 'online')
    assert.deepEqual(ws.last('social_enable'), { t: 'social_enable', value: true })
    assert.ok(ws.last('friends_get'))
    ws.push({ t: 'friends', me: { enabled: true, code: 'ABCD2345', status: 'online', hideServer: false, allowRequests: 'all' },
        friends: [{ uuid: U('b'), name: 'Bob', online: true, status: 'online', server: 'play.example.com' }], incoming: [{ uuid: U('c'), name: 'Carol' }], outgoing: [], blocked: [] })
    const st = c.getState()
    assert.equal(st.enabled, true)
    assert.equal(st.me.code, 'ABCD2345')
    assert.equal(st.friends[0].server, 'play.example.com')
    st.friends.length = 0
    assert.equal(c.getState().friends.length, 1, 'getState retorna una copia')

    // accio amb resposta
    const p = c.act('add', { name: 'Bob' })
    await tick()
    assert.deepEqual(ws.last('friend_add'), { t: 'friend_add', name: 'Bob' })
    ws.push({ t: 'friend_result', op: 'add', result: 'sent' })
    assert.equal(await p, 'sent')
    await assert.rejects(() => c.act('add', { name: '' }), /SOCIAL_ERROR:INVALID/)
    assert.equal(await c.act('settings', { status: 'busy' }), 'ok')
    assert.deepEqual(ws.last('social_settings'), { t: 'social_settings', status: 'busy' })

    // exportacio i esborrat
    const pe = c.act('export')
    await tick()
    ws.push({ t: 'social_export', data: { profile: { uuid: U('a') } } })
    assert.deepEqual(await pe, { profile: { uuid: U('a') } })
    const pd = c.act('delete')
    await tick()
    ws.push({ t: 'social_deleted' })
    assert.equal(await pd, 'ok')
    assert.equal(c.getState().enabled, false)
    assert.deepEqual(c.getState().friends, [])

    // esdeveniments
    ws.push({ t: 'friend_event', kind: 'request', uuid: U('c'), name: 'Carol' })
    assert.deepEqual(events, [{ kind: 'request', uuid: U('c'), name: 'Carol' }])

    // missatges bruts no trenquen res
    ws.onmessage({ data: 'no es json' })
    ws.onmessage({ data: '42' })
    ws.push({ t: 'desconegut' })

    // reconnexio: el relay tanca i torna a connectar sol amb el mateix token
    ws.close()
    await tick(60)
    assert.equal(FakeWS.all.length, 2, 'ha reconnectat')
    assert.equal(auths, 1, 'no torna a passar per Mojang mentre el token val')
    FakeWS.all[1].push({ t: 'ready', v: 1, uuid: U('a'), maxPlayers: 200 })
    assert.equal(c.getState().phase, 'online')

    // bye auth: el token es descarta i es torna a autenticar
    FakeWS.all[1].push({ t: 'bye', reason: 'auth' })
    FakeWS.all[1].close()
    await tick(80)
    assert.equal(auths, 2, 're-autentica despres de bye auth')
    assert.equal(FakeWS.all.length, 3)

    // sense connexio les accions fallen net
    c.stop()
    assert.equal(c.getState().phase, 'off')
    await assert.rejects(() => c.act('add', { name: 'Bob' }), /SOCIAL_ERROR:OFFLINE/)

    // desactivat per l'usuari: start no fa res
    wanted = false
    const before = FakeWS.all.length
    c.start()
    await tick()
    assert.equal(FakeWS.all.length, before)

    // autenticacio fallida: estat d'error i reintent
    wanted = true
    let ok = false
    const c2 = create({
        authenticate: async () => (ok ? { token: 'T2', expiresAt: Date.now() + 3600000 } : null),
        wanted: () => wanted, url: 'wss://relay.example/ws', WebSocketImpl: FakeWS, backoffMs: [20]
    })
    c2.start()
    await tick()
    assert.deepEqual([c2.getState().phase, c2.getState().error], ['error', 'auth'])
    ok = true
    await tick(60)
    assert.equal(FakeWS.all.at(-1).last('hello').token, 'T2')
    c2.stop()

    // pausa: envia social_enable false i tanca
    const c3 = create({ authenticate: async () => ({ token: 'T3', expiresAt: Date.now() + 3600000 }), wanted: () => true, url: 'wss://relay.example/ws', WebSocketImpl: FakeWS, backoffMs: [20] })
    c3.start()
    await tick()
    const w3 = FakeWS.all.at(-1)
    w3.push({ t: 'ready', v: 1, uuid: U('a'), maxPlayers: 200 })
    c3.pause()
    assert.deepEqual(w3.last('social_enable'), { t: 'social_enable', value: false })
    await tick(250)
    assert.equal(c3.getState().phase, 'off')
    assert.equal(w3.readyState, 3)
    console.log('socialclient: all OK')
})().catch((err) => { console.error(err); process.exit(1) })
