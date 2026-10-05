'use strict'
// B6: fitxers compartits com a còpies sincronitzades (no enllaços durs, que Minecraft trenca en desar `servers.dat`).
const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const Module = require('node:module')

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'hellmc-share-'))
const userData = path.join(root, 'userData')
process.env.APPDATA = path.join(root, 'appdata')
process.env.HOME = path.join(root, 'home')
const originalLoad = Module._load
Module._load = function (request, ...rest) {
    if (request === 'electron') return { app: { getPath: () => userData } }
    return originalLoad.call(this, request, ...rest)
}

const ConfigManager = require('../app/assets/js/configmanager')
const DataSharing = require('../app/assets/js/datasharing')
ConfigManager.load()
ConfigManager.setDataDirectory(path.join(root, 'data'))

const version = { id: 'v1' }
const sharedRoot = ConfigManager.getSharedDataRoot()
const mk = (id) => { const dir = path.join(root, 'instances', id); fs.mkdirSync(dir, { recursive: true }); return dir }
const write = (file, text, mtimeSeconds) => {
    fs.mkdirSync(path.dirname(file), { recursive: true })
    fs.writeFileSync(file, text)
    if (mtimeSeconds != null) fs.utimesSync(file, mtimeSeconds, mtimeSeconds)
}
const read = (file) => fs.readFileSync(file, 'utf8')

async function main() {
    // 1) primer llançament amb dades a l'arrel compartida: es copien a la instància (no són el mateix fitxer)
    write(path.join(sharedRoot, 'servers.dat'), 'shared-servers', 1000)
    const a = mk('a')
    await DataSharing.applyDataSharing(a, version, 'a')
    assert.equal(read(path.join(a, 'servers.dat')), 'shared-servers')
    assert.notEqual(fs.statSync(path.join(a, 'servers.dat')).ino, fs.statSync(path.join(sharedRoot, 'servers.dat')).ino, 'còpia, no enllaç dur')

    // 2) el joc desa substituint el fitxer; en tancar, la instància torna a l'arrel i la veu una altra versió
    write(path.join(a, 'servers.dat'), 'servers-after-play', 2000)
    await DataSharing.syncBack(a, version, 'a')
    assert.equal(read(path.join(sharedRoot, 'servers.dat')), 'servers-after-play')
    const b = mk('b')
    await DataSharing.applyDataSharing(b, { id: 'v2' }, 'b')
    assert.equal(read(path.join(b, 'servers.dat')), 'servers-after-play')

    // 3) cap còpia `.separate-*` ni fitxers buits per aquest camí
    assert.ok(!fs.readdirSync(a).some((n) => n.includes('.separate-')))

    // 4) la instància és més nova que l'arrel (el launcher es va tancar abans del joc): en el següent llançament guanya la instància
    write(path.join(a, 'options.txt'), 'options-new', 5000)
    write(path.join(sharedRoot, 'options.txt'), 'options-old', 3000)
    await DataSharing.applyDataSharing(a, version, 'a')
    assert.equal(read(path.join(sharedRoot, 'options.txt')), 'options-new')

    // 5) un enllaç dur d'una versió antiga del client es converteix en fitxer independent (sense perdre el contingut)
    const c = mk('c')
    fs.linkSync(path.join(sharedRoot, 'servers.dat'), path.join(c, 'servers.dat'))
    await DataSharing.applyDataSharing(c, { id: 'v3' }, 'c')
    assert.notEqual(fs.statSync(path.join(c, 'servers.dat')).ino, fs.statSync(path.join(sharedRoot, 'servers.dat')).ino)
    assert.equal(read(path.join(c, 'servers.dat')), 'servers-after-play')

    // 6) dades separades (`forcedSeparate`): no es toca res i no hi ha sincronització
    const d = mk('d')
    write(path.join(d, 'servers.dat'), 'private', 9000)
    await DataSharing.applyDataSharing(d, { id: 'v4', dataSharing: 'forcedSeparate' }, 'd')
    await DataSharing.syncBack(d, { id: 'v4', dataSharing: 'forcedSeparate' }, 'd')
    assert.equal(read(path.join(d, 'servers.dat')), 'private')
    assert.equal(read(path.join(sharedRoot, 'servers.dat')), 'servers-after-play')

    // 7) `saves` és una carpeta enllaçada a l'arrel compartida
    assert.ok(fs.lstatSync(path.join(a, 'saves')).isSymbolicLink())

    console.log('datasharing: all OK')
}

main().then(() => {
    Module._load = originalLoad
    fs.rmSync(root, { recursive: true, force: true })
}).catch((err) => {
    console.error(err)
    process.exit(1)
})
