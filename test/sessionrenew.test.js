'use strict'
// Autorenovacio del token de Minecraft durant la partida (plans/10 part B): el launcher refresca i deixa el token nou en un fitxer.
const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { create, SESSION_FILE } = require('../app/assets/js/sessionrenew')
const RuntimeManager = require('../app/assets/js/runtimemanager')

const UUID = '0123456789abcdef0123456789abcdef'

;(async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'hellmc-sessionrenew-'))
    try {
        const gameDir = path.join(root, 'game')
        fs.mkdirSync(gameDir, { recursive: true })
        const file = path.join(gameDir, SESSION_FILE)
        const logs = []
        const state = { account: { accessToken: 'TOKEN-1', expiresAt: 1000, type: 'microsoft' }, status: 'ok', refreshed: [] }
        let cleared = 0
        const sr = create({
            refresh: async (uuid) => { state.refreshed.push(uuid); return state.status },
            getAccount: (uuid) => (uuid === UUID ? state.account : undefined),
            log: (m) => logs.push(m),
            setIntervalFn: () => ({ unref() {} }),
            clearIntervalFn: () => { cleared++ }
        })

        // fitxer residual d'una partida anterior: s'esborra en vigilar
        fs.writeFileSync(file, '{"old":true}')
        const w = sr.watch(gameDir, UUID)
        assert.ok(!fs.existsSync(file))

        // res ha canviat: no s'escriu res
        await w.tick()
        assert.deepEqual(state.refreshed, [UUID])
        assert.ok(!fs.existsSync(file))

        // el launcher refresca i el token canvia: s'entrega
        state.account = { accessToken: 'TOKEN-2', expiresAt: 99999, type: 'microsoft' }
        await w.tick()
        const written = JSON.parse(fs.readFileSync(file, 'utf8'))
        assert.deepEqual(written, { v: 1, uuid: UUID, accessToken: 'TOKEN-2', expiresAt: 99999 })
        if (process.platform !== 'win32') assert.equal(fs.statSync(file).mode & 0o777, 0o600)
        assert.deepEqual(fs.readdirSync(gameDir), [SESSION_FILE], 'cap fitxer temporal sobrant')

        // mateix token: no es reescriu
        const mtime = fs.statSync(file).mtimeMs
        await new Promise((r) => setTimeout(r, 20))
        await w.tick()
        assert.equal(fs.statSync(file).mtimeMs, mtime)

        // sense xarxa / compte invalid: no s'escriu, es registra un cop sol i mai llança
        state.account = { accessToken: 'TOKEN-3', expiresAt: 1, type: 'microsoft' }
        state.status = 'offline'
        await w.tick()
        await w.tick()
        assert.equal(JSON.parse(fs.readFileSync(file, 'utf8')).accessToken, 'TOKEN-2')
        assert.equal(logs.filter((m) => m.includes('no s\'ha pogut renovar')).length, 1)
        state.status = 'ok'
        await w.tick()
        assert.equal(JSON.parse(fs.readFileSync(file, 'utf8')).accessToken, 'TOKEN-3')

        // refresc que peta: es captura
        const boom = create({ refresh: async () => { throw new Error('boom') }, getAccount: () => state.account, log: (m) => logs.push(m), setIntervalFn: () => ({}), clearIntervalFn: () => {} })
        await boom.watch(gameDir, UUID).tick()

        // el token mai surt als registres
        for (const m of logs) assert.ok(!/TOKEN-\d/.test(m), 'el token no es registra: ' + m)

        // el runtime sap on mirar
        const rt = RuntimeManager.create({ dataDir: path.join(root, 'ud'), clientVersion: '2.0.0', env: {}, devRuntimeDir: path.join(root, 'dev') })
        fs.mkdirSync(path.join(root, 'dev', 'modules'), { recursive: true })
        fs.writeFileSync(path.join(root, 'dev', 'hellmc-runtime.jar'), '')
        fs.writeFileSync(path.join(root, 'dev', 'modules', 'm.jar'), '')
        assert.ok(rt.jvmArgs({ minecraftVersion: '26.3', gameDir }).includes(`-Dhellmc.session=${file}`))

        // en tancar-se el joc el fitxer s'esborra, i stop es idempotent
        w.stop()
        w.stop()
        assert.ok(!fs.existsSync(file))
        assert.equal(cleared, 1)
        await w.tick()
        assert.ok(!fs.existsSync(file), 'parat: tick no escriu res')
        console.log('sessionrenew: all OK')
    } finally {
        fs.rmSync(root, { recursive: true, force: true })
    }
})().catch((err) => {
    console.error(err)
    process.exit(1)
})
