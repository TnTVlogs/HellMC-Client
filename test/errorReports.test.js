'use strict'
// Informes d'errors (plans/08): neteja pura, cua i límits, deduplicació, elegibilitat i cos exacte per via.
const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const ER = require('../app/assets/js/errorReports')

const HOME = 'C:\\Users\\Maria Garcia'
const INSTANCE = 'D:\\Jocs\\HellMC\\instances\\infern-1.21'
const UID = '3f1c2b0e-9d3a-4f6e-8a55-1c7c1f6c2a10'
const JWT = 'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.dBjftJeZ4CVPmB92K27uhbUJU1p1r_wW1gFWFOEjXk'
const CTX = { replacements: [[INSTANCE, '<instance>'], [HOME, '~'], ['C:\\Users\\Maria Garcia\\AppData\\Roaming\\HellMC', '<userData>']], names: ['Notch_77'] }
const ENV = { clientVersion: '2.0.0', os: 'win', osVersion: '10.0.26300', arch: 'x64', electron: '44.0.0' }

function assertClean(text) {
    for (const bad of ['Maria', 'Garcia', 'Notch_77', 'Jocs', 'infern-1.21', UID, JWT, 'abc123secret', 'maria@example.com', 'sk_live']) {
        assert.ok(!text.includes(bad), `"${bad}" filtrat a: ${text}`)
    }
}

// ---- neteja pura ----
const dirty = [
    `Error: boom at ${HOME}\\AppData\\Roaming\\HellMC\\logs\\x.log`,
    `at open (${INSTANCE}\\mods\\a.jar:10:5)`,
    `at file:///C:/Users/Maria%20Garcia/app/x.js:1:1`,
    'path /Users/maria/Library/x and /home/maria/.config/y',
    `Authorization: Bearer ${JWT}`,
    'access_token=abc123secret&x=1',
    `uuid ${UID} player Notch_77 mail maria@example.com`,
    'GET https://api.example.com/profile?token=sk_live_1234567890&u=1#frag'
].join('\n')
const out = ER.sanitizeText(dirty, CTX)
assertClean(out)
assert.ok(out.includes('<instance>') && out.includes('<userData>') && out.includes('<player>') && out.includes('<uuid>') && out.includes('<email>'))
assert.ok(out.includes('https://api.example.com/profile') && !out.includes('?token'))
assert.ok(out.includes('~'))
// el nom d'usuari no surt ni amb minúscules/URL-encoded parcial
assert.ok(!/maria/i.test(out.replace(/<[^>]+>/g, '')) )

// fuzz senzill: qualsevol combinació de fragments bruts surt neta
const fragments = [`${HOME}\\x`, `${INSTANCE}\\y`, `Bearer ${JWT}`, UID, 'maria@example.com', 'Notch_77', 'token=abc123secret']
for (let i = 0; i < 300; i++) {
    const text = Array.from({ length: 6 }, () => fragments[Math.floor(Math.random() * fragments.length)]).join(i % 2 ? ' ' : '\n')
    assertClean(ER.sanitizeText(text, CTX))
}

// esdeveniment: llista tancada de camps, límits
const big = ER.sanitizeEvent({
    kind: 'weird', name: 'TypeError', message: 'm'.repeat(2000) + HOME,
    stack: `TypeError: x\n${'    at f (' + HOME + '\\a.js:1:1)\n'.repeat(2000)}`,
    lastLog: Array.from({ length: 100 }, (_, i) => `linia ${i} ${HOME} ${UID}`)
}, ENV, CTX)
assert.deepEqual(Object.keys(big).sort(), ['arch', 'clientVersion', 'electron', 'kind', 'lastLog', 'message', 'name', 'os', 'osVersion', 'stack', 'v'])
assert.equal(big.kind, 'main')
assert.ok(big.message.length <= 500)
assert.ok(Buffer.byteLength(big.stack, 'utf8') <= 8 * 1024)
assert.equal(big.lastLog.split('\n').length, 40)
assert.ok(big.lastLog.includes('linia 99') && !big.lastLog.includes('linia 59'))
assertClean(JSON.stringify(big))
assert.equal(ER.sanitizeEvent({ kind: 'game', name: 'N', message: 'm', stack: '' }, ENV, CTX).lastLog, undefined)

// empremta estable (ignora línia/columna)
const e1 = ER.sanitizeEvent({ kind: 'main', name: 'E', message: 'a', stack: 'E: a\n    at f (x.js:1:2)\n    at g (y.js:3:4)' }, ENV, CTX)
const e2 = ER.sanitizeEvent({ kind: 'main', name: 'E', message: 'b', stack: 'E: b\n    at f (x.js:9:9)\n    at g (y.js:8:8)' }, ENV, CTX)
assert.equal(ER.fingerprint(e1), ER.fingerprint(e2))

// ---- mòdul ----
function setup(over = {}) {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'hellmc-er-'))
    const legal = { termsAcceptedVersion: 1, errorReportOptIn: false, crashPromptDisabled: false, crashPromptAt: null, telemetryOptIn: false, telemetryId: null, ...over.legal }
    const calls = []
    let clock = over.start ?? 1_000_000
    const m = ER.create({
        getLegal: () => legal,
        setLegal: (p) => Object.assign(legal, p),
        save: () => {},
        termsVersion: () => 1,
        appVersion: '2.0.0',
        platform: over.platform ?? 'win32',
        osVersion: '10.0.26300', arch: 'x64', electronVersion: '44.0.0',
        isDev: over.isDev ?? false,
        queueFile: path.join(dir, 'error-queue.json'),
        getContext: () => CTX,
        getLastLog: () => [`log ${HOME}`],
        now: () => clock,
        fetchFn: over.fetchFn ?? (async (url, init) => { calls.push({ url, init, body: JSON.parse(init.body) }); return { ok: true, status: 204 } })
    })
    return { m, legal, calls, dir, tick: (ms) => { clock += ms }, file: path.join(dir, 'error-queue.json') }
}
const err = (n, severe = false) => ({ kind: 'main', name: `Err${n}`, message: `boom ${n} ${HOME}`, stack: `Err${n}: x\n    at fn${n} (a.js:1:1)`, severe })

async function main() {
    // dev, termes, SO desconegut: res
    for (const over of [{ isDev: true }, { legal: { termsAcceptedVersion: null } }, { platform: 'freebsd' }]) {
        const s = setup({ ...over, legal: { errorReportOptIn: true, ...over.legal } })
        assert.equal(await s.m.capture(err(1, true)), false)
        assert.equal(s.calls.length, 0)
        assert.ok(!fs.existsSync(s.file))
        assert.equal(s.m.getPendingPrompt(), null)
    }

    // sense opt-in i no greu: res; greu: es desa a disc i NO s'envia
    let s = setup()
    assert.equal(await s.m.capture(err(1)), false)
    assert.ok(!fs.existsSync(s.file))
    assert.equal(await s.m.capture(err(2, true)), true)
    assert.equal(s.calls.length, 0)
    let q = s.m._readQueue()
    assert.equal(q.length, 1)
    assert.equal(q[0].mode, 'prompt')
    assertClean(fs.readFileSync(s.file, 'utf8'))

    // diàleg: un per arrencada, JSON exacte = cos enviat, sense id encara que hi hagi telemetria
    s.legal.telemetryOptIn = true
    s.legal.telemetryId = UID
    const p = s.m.getPendingPrompt()
    assert.ok(p)
    assert.equal(p.report.mode, 'prompt')
    assert.ok(!('id' in p.report))
    assert.equal(s.m.getPendingPrompt(), null, 'un sol diàleg per arrencada')
    await s.m.answerPrompt('send')
    assert.equal(s.calls.length, 1)
    assert.equal(s.calls[0].url, 'https://hellmcclient.sergidalmau.dev/api/telemetry/error')
    assert.deepEqual(s.calls[0].body, p.report)
    assert.equal(JSON.stringify(s.calls[0].body, null, 2), p.json)
    assert.ok(!('id' in s.calls[0].body))
    assert.ok(s.calls[0].init.signal, 'amb timeout')
    assert.equal(s.m._readQueue().length, 0)

    // màx. un per hora (entre arrencades) i «no ho tornis a preguntar»
    s = setup()
    await s.m.capture(err(3, true))
    assert.ok(s.m.getPendingPrompt())
    const t0 = s.legal.crashPromptAt
    assert.equal(typeof t0, 'number')
    const s2 = setup({ legal: { crashPromptAt: 1_000_000 }, start: 1_000_000 + 30 * 60 * 1000 })
    await s2.m.capture(err(3, true))
    assert.equal(s2.m.getPendingPrompt(), null, 'menys d\'una hora')
    const s3 = setup({ legal: { crashPromptAt: 1_000_000 }, start: 1_000_000 + 61 * 60 * 1000 })
    await s3.m.capture(err(3, true))
    assert.ok(s3.m.getPendingPrompt())
    await s3.m.answerPrompt('never')
    assert.equal(s3.legal.crashPromptDisabled, true)
    assert.equal(s3.m._readQueue().length, 0)
    assert.equal(s3.calls.length, 0, 'never no envia')
    const s4 = setup({ legal: { crashPromptDisabled: true } })
    await s4.m.capture(err(4, true))
    assert.equal(s4.m.getPendingPrompt(), null)
    // dismiss: no envia i esborra
    s = setup()
    await s.m.capture(err(5, true))
    s.m.getPendingPrompt()
    await s.m.answerPrompt('dismiss')
    assert.equal(s.calls.length, 0)
    assert.equal(s.m._readQueue().length, 0)

    // via automàtica: s'envia, amb id només si hi ha opt-in d'ús
    s = setup({ legal: { errorReportOptIn: true } })
    await s.m.capture(err(6))
    assert.equal(s.calls.length, 1)
    assert.equal(s.calls[0].body.mode, 'auto')
    assert.ok(!('id' in s.calls[0].body))
    assert.deepEqual(Object.keys(s.calls[0].body).sort(), ['arch', 'clientVersion', 'electron', 'kind', 'lastLog', 'message', 'mode', 'name', 'os', 'osVersion', 'stack', 'v'])
    assertClean(s.calls[0].init.body)
    assert.equal(s.m._readQueue().length, 0)
    s = setup({ legal: { errorReportOptIn: true, telemetryOptIn: true, telemetryId: UID } })
    await s.m.capture(err(7))
    assert.equal(s.calls[0].body.id, UID)
    // amb opt-in d'ús apagat l'id no surt encara que n'hi hagi un de guardat
    s = setup({ legal: { errorReportOptIn: true, telemetryOptIn: false, telemetryId: UID } })
    await s.m.capture(err(8))
    assert.ok(!('id' in s.calls[0].body))
    // el diàleg no surt amb opt-in
    await s.m.capture(err(9, true))
    assert.equal(s.m.getPendingPrompt(), null)

    // deduplicació per sessió i màx. 5/hora
    s = setup({ legal: { errorReportOptIn: true } })
    await s.m.capture(err(1)); await s.m.capture(err(1))
    assert.equal(s.calls.length, 1)
    for (let i = 10; i < 20; i++) await s.m.capture(err(i))
    assert.equal(s.calls.length, 5)
    s.tick(61 * 60 * 1000)
    await s.m.capture(err(30))
    assert.equal(s.calls.length, 6)

    // xarxa caiguda: es queda a la cua; propera arrencada l'envia
    let fail = true
    s = setup({ legal: { errorReportOptIn: true }, fetchFn: async (u, init) => { if (fail) throw new Error('offline'); s.calls.push({ body: JSON.parse(init.body) }); return { ok: true, status: 204 } } })
    await s.m.capture(err(40))
    assert.equal(s.m._readQueue().length, 1)
    fail = false
    await s.m._flush()
    assert.equal(s.calls.length, 1)
    assert.equal(s.m._readQueue().length, 0)
    // 400: descartada sense reintents; 500: es conserva
    s = setup({ legal: { errorReportOptIn: true }, fetchFn: async () => ({ ok: false, status: 400 }) })
    await s.m.capture(err(41))
    assert.equal(s.m._readQueue().length, 0)
    s = setup({ legal: { errorReportOptIn: true }, fetchFn: async () => ({ ok: false, status: 500 }) })
    await s.m.capture(err(42))
    assert.equal(s.m._readQueue().length, 1)

    // límits de la cua: 20 entrades i 64 KB
    s = setup({ legal: { errorReportOptIn: true }, fetchFn: async () => ({ ok: false, status: 500 }) })
    const bigLog = Array.from({ length: 40 }, (_, i) => `${i} ${'x'.repeat(250)}`)
    for (let i = 0; i < 30; i++) {
        s.tick(61 * 60 * 1000)
        await s.m.capture({ ...err(100 + i), stack: `E: x\n    at fn${i} (a.js:1:1)\n${'    at g (b.js:1:1)\n'.repeat(400)}`, lastLog: bigLog })
    }
    q = s.m._readQueue()
    assert.ok(q.length <= ER.MAX_QUEUE_ENTRIES)
    assert.ok(fs.statSync(s.file).size <= ER.MAX_QUEUE_BYTES)
    assert.ok(q.length >= 1)

    // retirar l'opt-in esborra el pendent automàtic però manté l'informe puntual
    s = setup({ legal: { errorReportOptIn: true }, fetchFn: async () => ({ ok: false, status: 500 }) })
    await s.m.capture(err(50))
    s.legal.errorReportOptIn = false
    await s.m.onConsentChanged()
    assert.equal(s.m._readQueue().length, 0)

    // cua corrupta o fetch que llança: mai llança
    s = setup({ legal: { errorReportOptIn: true } })
    fs.writeFileSync(s.file, '{no json')
    assert.equal(await s.m.capture(err(60)), true)
    s.m.start()

    console.log('errorReports: all OK')
}

main().then(() => process.exit(0), (e) => { console.error(e); process.exit(1) })
