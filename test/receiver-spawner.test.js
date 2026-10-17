'use strict'
// B23/S10: entorn mínim del receptor i spawner sobre un `utilityProcess` fals (sense Electron).
const assert = require('node:assert/strict')
const path = require('node:path')
const { EventEmitter } = require('node:events')
const { fork } = require('node:child_process')
const { buildReceiverEnv, createUtilityProcessSpawner, installReceiverSpawner } = require('../src-node/receiverSpawner')

// ---- buildReceiverEnv ----
const env = buildReceiverEnv({
    PATH: '/bin', SystemRoot: 'C:\\Windows', TEMP: 'C:\\t', HTTPS_PROXY: 'http://p:1', https_proxy: 'http://p:1', NO_PROXY: 'x',
    NODE_EXTRA_CA_CERTS: '/ca.pem', ELECTRON_RUN_AS_NODE: '1', ELECTRON_ENABLE_LOGGING: '1', NODE_OPTIONS: '--inspect',
    NODE_PATH: '/x', GH_TOKEN: 'secret', MY_API_KEY: 'k', DEBUG: '*', RANDOM_THING: 'x', LANG: 'ca_ES', HELLMC_DEBUG: '1',
    UNDEF: undefined
})
assert.deepEqual(Object.keys(env).sort(), ['HELLMC_DEBUG', 'HTTPS_PROXY', 'LANG', 'NODE_EXTRA_CA_CERTS', 'NO_PROXY', 'PATH', 'SystemRoot', 'TEMP', 'https_proxy'].sort())
// les variables addicionals explícites passen, excepte les prohibides
const env2 = buildReceiverEnv({ PATH: '/bin' }, { FOO: 'bar', ELECTRON_RUN_AS_NODE: '1', NODE_OPTIONS: 'x', N: 3, NIL: null })
assert.deepEqual(env2, { PATH: '/bin', FOO: 'bar', N: '3' })
assert.deepEqual(buildReceiverEnv(undefined), {})
// Windows: noms en qualsevol majúscula
assert.equal(buildReceiverEnv({ systemroot: 'C:\\W' }).systemroot, 'C:\\W')

// ---- spawner sobre un utilityProcess fals ----
const fakeUtilityProcess = {
    lastOptions: null,
    lastArgs: null,
    fork(modulePath, args, options) {
        this.lastArgs = args
        this.lastOptions = options
        const child = fork(modulePath, args, { stdio: 'pipe', env: options.env })
        const ee = new EventEmitter()
        child.on('message', (m) => ee.emit('message', m))
        child.on('exit', (c) => ee.emit('exit', c))
        ee.stdout = child.stdout
        ee.stderr = child.stderr
        ee.postMessage = (m) => child.send(m)
        ee.kill = () => child.kill()
        return ee
    }
}

const fakeExecutor = path.join(__dirname, 'fake-receiver-executor.js')

async function main() {
    const { FullRepair } = require('hellmc-core/dl')
    const spawner = createUtilityProcessSpawner(fakeUtilityProcess, () => ({ PATH: process.env.PATH, ELECTRON_RUN_AS_NODE: '1', SECRET_TOKEN: 'x', SystemRoot: process.env.SystemRoot }))
    // el transmissor real crida spawn(ReceiverExecutor.js, ...): aquí es redirigeix al receptor fals
    const redirect = { spawn: (_p, name, extra) => spawner.spawn(fakeExecutor, name, extra) }

    // camí feliç + entorn net
    let repair = new FullRepair('c', 'i', 'l', 'ok', false, [], redirect)
    repair.spawnReceiver({ EXTRA: '1' })
    assert.deepEqual(fakeUtilityProcess.lastArgs, ['FullRepairReceiver'])
    assert.equal(fakeUtilityProcess.lastOptions.env.ELECTRON_RUN_AS_NODE, undefined)
    assert.equal(fakeUtilityProcess.lastOptions.env.SECRET_TOKEN, undefined)
    assert.equal(fakeUtilityProcess.lastOptions.env.EXTRA, '1')
    assert.equal(fakeUtilityProcess.lastOptions.stdio, 'pipe')
    const progress = []
    assert.equal(await repair.verifyFiles((p) => progress.push(p)), 3)
    assert.deepEqual(progress, [50])
    repair.destroyReceiver()
    repair.destroyReceiver() // idempotent

    // error de negoci -> Error(displayable)
    repair = new FullRepair('c', 'i', 'l', 'err', false, [], redirect)
    repair.spawnReceiver()
    await assert.rejects(repair.verifyFiles(() => {}), /Request received no response \(ENOTFOUND\)\./)
    repair.destroyReceiver()

    // el fill mor -> RECEIVER_EXITED (no es penja)
    repair = new FullRepair('c', 'i', 'l', 'die', false, [], redirect)
    repair.spawnReceiver()
    await assert.rejects(repair.verifyFiles(() => {}), (e) => e.code === 'RECEIVER_EXITED' && /^RECEIVER_EXITED:/.test(e.message))
    repair.destroyReceiver()

    // cancel·lació a mig descarregar -> LAUNCH_CANCELLED i el fill s'atura
    repair = new FullRepair('c', 'i', 'l', 'ok', false, [], redirect)
    repair.spawnReceiver()
    await repair.verifyFiles(() => {})
    const got = []
    const pending = repair.download((p) => got.push(p))
    for (let i = 0; i < 100 && got.length === 0; i++) await new Promise((r) => setTimeout(r, 20))
    assert.deepEqual(got, [10])
    const handle = repair.handle
    repair.destroyReceiver()
    await assert.rejects(pending, /LAUNCH_CANCELLED/)
    for (let i = 0; i < 100 && handle.alive; i++) await new Promise((r) => setTimeout(r, 20))
    assert.equal(handle.alive, false)

    // install: registra l'spawner per defecte
    let installed = null
    installReceiverSpawner({ setDefaultSpawner: (s) => { installed = s } }, fakeUtilityProcess)
    assert.equal(typeof installed.spawn, 'function')

    console.log('receiver-spawner: all OK')
}

main().then(() => process.exit(0), (e) => { console.error(e); process.exit(1) })
