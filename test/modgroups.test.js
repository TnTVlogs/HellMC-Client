const assert = require('node:assert/strict')
const { build } = require('../app/assets/js/modgroups.js')

const m = (id, required, dependencies = []) => ({ id, required, dependencies })
const st = obj => new Map(Object.entries(obj))

// Fabric API (lib) needed by A i B. A, B, lib opcionals, tot ON.
{
    const g = build([m('A', false, ['lib']), m('B', false, ['lib']), m('lib', false)])
    const s = st({ A: true, B: true, lib: true })
    assert.deepEqual(g.blockers(s, 'lib').sort(), ['A', 'B'])
    assert.equal(g.disable(s, 'lib'), null) // bloquejat
    assert.deepEqual(g.disable(s, 'A'), ['A']) // lib la necessita B
    assert.equal(s.get('lib'), true)
    assert.deepEqual(g.disable(s, 'B').sort(), ['B', 'lib']) // ara lib cau amb B
    assert.equal(s.get('lib'), false)
    // reactivar B reactiva lib
    assert.deepEqual(g.enable(s, 'B').sort(), ['B', 'lib'])
}
// Cadena A->B->C: activar A activa tot; desactivar A ho apaga tot.
{
    const g = build([m('A', false, ['B']), m('B', false, ['C']), m('C', false)])
    const s = st({ A: false, B: false, C: false })
    assert.deepEqual(g.enable(s, 'A').sort(), ['A', 'B', 'C'])
    assert.deepEqual(g.disable(s, 'A').sort(), ['A', 'B', 'C'])
}
// dependència required no es toca; desactivar A no la desactiva.
{
    const g = build([m('A', false, ['R']), m('R', true)])
    const s = st({ A: true })
    assert.deepEqual(g.disable(s, 'A'), ['A'])
    assert.equal(g.disable(s, 'R'), null)
}
// B desactivat i no bloqueja: A i B comparteixen lib, B off -> disable A apaga lib.
{
    const g = build([m('A', false, ['lib']), m('B', false, ['lib']), m('lib', false)])
    const s = st({ A: true, B: false, lib: true })
    assert.deepEqual(g.disable(s, 'A').sort(), ['A', 'lib'])
}
// normalize: A ON amb lib OFF -> lib forçada.
{
    const g = build([m('A', false, ['lib']), m('lib', false)])
    const s = st({ A: true, lib: false })
    assert.deepEqual(g.normalize(s), ['lib'])
    assert.equal(s.get('lib'), true)
}
// cicle A<->B no penja.
{
    const g = build([m('A', false, ['B']), m('B', false, ['A'])])
    const s = st({ A: true, B: true })
    assert.equal(g.disable(s, 'A'), null) // B (activat) la necessita
    s.set('B', false)
    assert.deepEqual(g.disable(s, 'A'), ['A'])
}
// ids desconeguts a dependencies s'ignoren.
{
    const g = build([m('A', false, ['ghost'])])
    const s = st({ A: true })
    assert.deepEqual(g.disable(s, 'A'), ['A'])
}
console.log('client algorithm: all OK')
