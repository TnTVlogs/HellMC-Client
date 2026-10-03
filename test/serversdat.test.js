const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { ensureServer, normalizeAddress, parse, serialize } = require('../app/assets/js/serversdat.js')

const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'serversdat-'))
const ips = (file) => {
    const root = parse(fs.readFileSync(file))
    const list = root.entries.find((e) => e.name.toString() === 'servers')
    return list.value.items.map((item) => ({
        ip: item.find((e) => e.name.toString() === 'ip').value.subarray(2).toString('utf8'),
        name: item.find((e) => e.name.toString() === 'name').value.subarray(2).toString('utf8')
    }))
}

// adreces
assert.equal(normalizeAddress('Play.HellMC.net:25565'), 'play.hellmc.net')
assert.equal(normalizeAddress('play.hellmc.net.'), 'play.hellmc.net')
assert.equal(normalizeAddress('play.hellmc.net:25566'), 'play.hellmc.net:25566')

// fitxer inexistent: es crea
{
    const dir = tmp()
    assert.equal(ensureServer(dir, { name: 'HellMC Survival', address: 'play.hellmc.net' }).status, 'added')
    assert.deepEqual(ips(path.join(dir, 'servers.dat')), [{ ip: 'play.hellmc.net', name: 'HellMC Survival' }])
    // segona vegada: ja hi és
    assert.equal(ensureServer(dir, { name: 'Un altre nom', address: 'PLAY.hellmc.net:25565' }).status, 'exists')
    assert.equal(ips(path.join(dir, 'servers.dat')).length, 1)
    // un altre servidor: s'afegeix també
    assert.equal(ensureServer(dir, { name: 'Creatiu', address: 'creatiu.hellmc.net' }).status, 'added')
    assert.deepEqual(ips(path.join(dir, 'servers.dat')).map((s) => s.name), ['HellMC Survival', 'Creatiu'])
}

// no es perd res del que ja hi havia (etiquetes desconegudes, icona, emojis en format de Java)
{
    const dir = tmp()
    const str = (s) => { const b = Buffer.from(s, 'utf8'); const h = Buffer.alloc(2); h.writeUInt16BE(b.length); return Buffer.concat([h, b]) }
    const name = (s) => str(s)
    const entry = (type, n, payload) => Buffer.concat([Buffer.from([type]), name(n), payload])
    const server = Buffer.concat([entry(8, 'ip', str('mc.exemple.com')), entry(8, 'name', str('Casa')), entry(8, 'icon', str('iVBORw0KGgo=')), entry(1, 'hidden', Buffer.from([1])), Buffer.from([0])])
    const list = Buffer.concat([Buffer.from([10]), (() => { const b = Buffer.alloc(4); b.writeInt32BE(1); return b })(), server])
    const root = Buffer.concat([Buffer.from([10]), name(''), entry(9, 'servers', list), entry(3, 'extra', Buffer.from([0, 0, 0, 7])), Buffer.from([0])])
    fs.writeFileSync(path.join(dir, 'servers.dat'), root)
    // round-trip exacte sense canvis
    assert.ok(serialize(parse(root)).equals(root))
    assert.equal(ensureServer(dir, { name: 'Nou', address: 'nou.hellmc.net' }).status, 'added')
    const after = fs.readFileSync(path.join(dir, 'servers.dat'))
    assert.ok(after.includes(Buffer.from('iVBORw0KGgo=')), 'ha conservat la icona')
    assert.ok(after.includes(Buffer.from('extra')), 'ha conservat etiquetes desconegudes')
    assert.deepEqual(ips(path.join(dir, 'servers.dat')).map((s) => s.ip), ['mc.exemple.com', 'nou.hellmc.net'])
}

// l'enllaç dur de dades compartides es manté (s'escriu al mateix fitxer)
{
    const dirA = tmp()
    const dirB = tmp()
    ensureServer(dirA, { name: 'A', address: 'a.example.com' })
    fs.linkSync(path.join(dirA, 'servers.dat'), path.join(dirB, 'servers.dat'))
    assert.equal(ensureServer(dirA, { name: 'B', address: 'b.example.com' }).status, 'added')
    assert.deepEqual(ips(path.join(dirB, 'servers.dat')).map((s) => s.ip), ['a.example.com', 'b.example.com'])
}

// fitxer corrupte o sense servidor: no es toca
{
    const dir = tmp()
    fs.writeFileSync(path.join(dir, 'servers.dat'), Buffer.from('no és NBT'))
    const before = fs.readFileSync(path.join(dir, 'servers.dat'))
    assert.equal(ensureServer(dir, { name: 'X', address: 'x.example.com' }).status, 'skipped')
    assert.ok(fs.readFileSync(path.join(dir, 'servers.dat')).equals(before))
    assert.equal(ensureServer(dir, null).status, 'skipped')
}
console.log('serversdat: all OK')
