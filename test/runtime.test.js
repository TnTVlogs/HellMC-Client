'use strict'
// HellMC Runtime (docs/client-cosmetics/19): el baixa la distribució a <instància>/hellmc-runtime/; només se'n passen els
// arguments a la JVM quan el runtime i els mòduls hi són, i no hi queden jars vells.
const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { create, DISTRIBUTION_FORMAT, INSTANCE_FOLDER } = require('../app/assets/js/runtimemanager')

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'hellmc-runtime-'))
try {
    const dataDir = path.join(root, 'userData')
    const gameDir = path.join(root, 'game')
    const launch = { minecraftVersion: '26.3', gameDir }
    const make = (extra = {}) => create({ dataDir, clientVersion: '2.0.0-alpha1', env: {}, ...extra })
    const rt = path.join(gameDir, INSTANCE_FOLDER)
    const touch = (file, t) => {
        fs.mkdirSync(path.dirname(file), { recursive: true })
        fs.writeFileSync(file, '')
        if (t) fs.utimesSync(file, t, t)
    }

    // res baixat: cap argument (el joc arrenca igual)
    assert.equal(make().available(gameDir), false)
    assert.deepEqual(make().jvmArgs(launch), [])

    // només l'agent, sense mòduls: tampoc
    touch(path.join(rt, 'hellmc-runtime-aaaaaaaa.jar'), 1000)
    assert.deepEqual(make().jvmArgs(launch), [])

    // complet
    touch(path.join(rt, 'modules', 'hellmc-cosmetics-11111111.jar'))
    const args = make().jvmArgs(launch)
    assert.equal(args[0], `-javaagent:${path.join(rt, 'hellmc-runtime-aaaaaaaa.jar')}`)
    assert.ok(args.includes('-Dhellmc.client.version=2.0.0-alpha1'))
    assert.ok(args.includes(`-Dhellmc.distribution.format=${DISTRIBUTION_FORMAT}`))
    assert.equal(DISTRIBUTION_FORMAT, 2)
    assert.ok(args.includes('-Dhellmc.mc.version=26.3'))
    assert.ok(args.includes(`-Dhellmc.modules=${path.join(rt, 'modules')}`))
    assert.ok(args.includes(`-Dhellmc.wardrobe=${path.join(dataDir, 'wardrobe')}`))
    assert.ok(args.includes(`-Dhellmc.skins=${path.join(dataDir, 'skins')}`))
    assert.ok(args.includes(`-Dhellmc.log=${path.join(gameDir, 'logs', 'hellmc-runtime.log')}`))
    assert.equal(args.filter((a) => a.startsWith('-javaagent')).length, 1)

    // compilació nova: la distribució declara només els jars nous, els vells s'esborren i no se'n toca cap altre fitxer
    touch(path.join(rt, 'hellmc-runtime-bbbbbbbb.jar'), 2000)
    touch(path.join(rt, 'modules', 'hellmc-cosmetics-22222222.jar'))
    touch(path.join(rt, 'readme.txt'))
    const expected = [path.join(rt, 'hellmc-runtime-bbbbbbbb.jar'), path.join(rt, 'modules', 'hellmc-cosmetics-22222222.jar')]
    assert.equal(make().jvmArgs(launch)[0], `-javaagent:${expected[0]}`) // sense prune, guanya el més nou
    const removed = make().prune(gameDir, expected)
    assert.equal(removed.length, 2)
    assert.ok(!fs.existsSync(path.join(rt, 'hellmc-runtime-aaaaaaaa.jar')))
    assert.ok(!fs.existsSync(path.join(rt, 'modules', 'hellmc-cosmetics-11111111.jar')))
    assert.ok(fs.existsSync(path.join(rt, 'readme.txt')))
    assert.deepEqual(make().prune(gameDir, expected), [])

    // interruptor d'emergència i versió del client absent
    assert.deepEqual(make({ env: { HELLMC_NO_RUNTIME: '1' } }).jvmArgs(launch), [])
    assert.deepEqual(make({ clientVersion: '' }).jvmArgs(launch), [])
    assert.deepEqual(make({ clientVersion: undefined }).jvmArgs(launch), [])

    // desenvolupament: carpeta local amb noms sense hash
    const dev = path.join(root, 'dev')
    touch(path.join(dev, 'hellmc-runtime.jar'))
    touch(path.join(dev, 'modules', 'hellmc-cosmetics.jar'))
    const other = path.join(root, 'other-game')
    assert.equal(make({ devRuntimeDir: dev }).jvmArgs({ minecraftVersion: '26.3', gameDir: other })[0], `-javaagent:${path.join(dev, 'hellmc-runtime.jar')}`)
    assert.deepEqual(make().jvmArgs({ minecraftVersion: '26.3', gameDir: other }), [])
    console.log('runtime: all OK')
} finally {
    fs.rmSync(root, { recursive: true, force: true })
}
