'use strict'
// La telemetria és opt-in: sense consentiment no s'envia res, el cos és exactament { v, id, version, os } i es pot retirar.
const assert = require('node:assert/strict')
const Telemetry = require('../app/assets/js/telemetry')

const ID = '3f1c2b0e-9d3a-4f6e-8a55-1c7c1f6c2a10'
const ID2 = '9a0d3b7e-2c41-4d5e-9b6f-0a1b2c3d4e5f'

function setup(over = {}) {
    const state = { telemetryOptIn: false, termsAcceptedVersion: 1, telemetryId: null, telemetryForget: null, ...over.legal }
    const calls = []
    const ids = [ID, ID2]
    const t = Telemetry.create({
        getLegal: () => state,
        setLegal: (p) => Object.assign(state, p),
        save: () => {},
        termsVersion: () => 1,
        appVersion: '2.0.0',
        platform: over.platform ?? 'win32',
        isDev: over.isDev ?? false,
        uuid: () => ids.shift(),
        random: () => 0,
        fetchFn: over.fetchFn ?? (async (url, init) => { calls.push({ url, body: JSON.parse(init.body), method: init.method }); return { ok: true, status: 204 } })
    })
    return { t, state, calls }
}

async function main() {
    // Sense consentiment: cap petició i cap identificador
    let s = setup()
    await s.t._ping()
    await s.t.onConsentChanged()
    s.t.start()
    s.t.stop()
    assert.equal(s.calls.length, 0)
    assert.equal(s.state.telemetryId, null)

    // Amb consentiment: cos exacte, id generat i desat
    s = setup({ legal: { telemetryOptIn: true } })
    await s.t._ping()
    assert.equal(s.calls.length, 1)
    assert.equal(s.calls[0].url, 'https://hellmcclient.sergidalmau.dev/api/telemetry/ping')
    assert.equal(s.calls[0].method, 'POST')
    assert.deepEqual(s.calls[0].body, { v: 1, id: ID, version: '2.0.0', os: 'win' })
    assert.deepEqual(Object.keys(s.calls[0].body).sort(), ['id', 'os', 'v', 'version'])
    assert.equal(s.state.telemetryId, ID)
    await s.t._ping()
    assert.equal(s.calls[1].body.id, ID, 'l\'id es reutilitza')

    // Sistemes operatius
    for (const [platform, os] of [['darwin', 'mac'], ['linux', 'linux']]) {
        const x = setup({ platform, legal: { telemetryOptIn: true } })
        await x.t._ping()
        assert.equal(x.calls[0].body.os, os)
    }
    const other = setup({ platform: 'freebsd', legal: { telemetryOptIn: true } })
    await other.t._ping()
    assert.equal(other.calls.length, 0, 'SO desconegut: no s\'envia res')

    // Mode desenvolupador i termes no acceptats: res
    s = setup({ isDev: true, legal: { telemetryOptIn: true } })
    await s.t._ping()
    assert.equal(s.calls.length, 0)
    s = setup({ legal: { telemetryOptIn: true, termsAcceptedVersion: null } })
    await s.t._ping()
    assert.equal(s.calls.length, 0)

    // Retirar el consentiment: forget, id esborrat; tornar-lo a activar dona un id nou
    s = setup({ legal: { telemetryOptIn: true } })
    await s.t._ping()
    s.state.telemetryOptIn = false
    await s.t.onConsentChanged()
    const forget = s.calls.at(-1)
    assert.equal(forget.url, 'https://hellmcclient.sergidalmau.dev/api/telemetry/forget')
    assert.deepEqual(forget.body, { id: ID })
    assert.equal(s.state.telemetryId, null)
    assert.equal(s.state.telemetryForget, null, 'petició feta: no queda res pendent')
    s.state.telemetryOptIn = true
    await s.t._ping()
    assert.equal(s.calls.at(-1).body.id, ID2)
    s.t.stop()

    // Si `forget` falla, queda pendent i es reintenta a l'arrencada
    let fail = true
    const urls = []
    s = setup({ legal: { telemetryOptIn: true, telemetryId: ID }, fetchFn: async (url) => { urls.push(url); if (fail) throw new Error('offline'); return { ok: true } } })
    s.state.telemetryOptIn = false
    await s.t.disable()
    assert.equal(s.state.telemetryForget, ID)
    assert.equal(s.state.telemetryId, null)
    fail = false
    s.t.start()
    await new Promise((r) => setTimeout(r, 20))
    assert.equal(s.state.telemetryForget, null)
    assert.ok(urls.at(-1).endsWith('/forget'))

    // Errors de xarxa i respostes d'error no propaguen excepcions
    s = setup({ legal: { telemetryOptIn: true }, fetchFn: async () => { throw new Error('offline') } })
    await s.t._ping()
    s = setup({ legal: { telemetryOptIn: true }, fetchFn: async () => ({ ok: false, status: 500 }) })
    await s.t._ping()

    console.log('telemetry: all OK')
}

main().then(() => process.exit(0), (e) => { console.error(e); process.exit(1) })
