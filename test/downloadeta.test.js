'use strict'
// Estimació de temps restant de la descàrrega (src-node/downloadEta.js).
const assert = require('node:assert/strict')
const { createEtaEstimator } = require('../src-node/downloadEta')

const e = createEtaEstimator()
// primera mostra: encara no hi ha estimació
assert.equal(e.sample(0, 1000), null)
// 10 % en 5 s = 2 %/s → queden 90 % → 45 s
assert.equal(e.sample(10, 6000), 45)
// velocitat constant: l'estimació es manté coherent (20 % en 5 s més → queden 70 %)
const eta = e.sample(20, 11000)
assert.ok(eta > 0 && eta < 45, `eta=${eta}`)
// sense canvi de percentatge no es recalcula però es retorna l'última velocitat
assert.equal(typeof e.sample(20, 12000), 'number')
// completat
assert.equal(e.sample(100, 20000), 0)

// un retrocés de percentatge (nova fase) reinicia l'estimació
const f = createEtaEstimator()
f.sample(50, 0)
assert.equal(f.sample(60, 1000) > 0, true)
assert.equal(f.sample(5, 2000), null)

// entrades invàlides
assert.equal(createEtaEstimator().sample(NaN), null)
assert.equal(createEtaEstimator().sample(undefined), null)

// topall de 24 h
const g = createEtaEstimator()
g.sample(0, 0)
assert.equal(g.sample(1, 1e9), 24 * 3600)

console.log('downloadeta.test.js OK')
