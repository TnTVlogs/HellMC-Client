'use strict'
// O2: el log mai ha de contenir credencials.
const assert = require('node:assert/strict')
const { redact } = require('../app/assets/js/applog')

const jwt = 'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.abcdefghijklmnopqrstu'

// argument de línia d'ordres
assert.ok(!redact(`java --accessToken ${jwt} --username Steve`).includes(jwt))
assert.ok(redact('java --username Steve').includes('--username Steve'))

// array imprès per util.inspect (valor a la línia següent, entre cometes)
const inspected = redact(`[\n  '--accessToken',\n  '${jwt}',\n  '--uuid',\n  'abcdef0123456789'\n]`)
assert.ok(!inspected.includes(jwt))
assert.ok(!inspected.includes('abcdef0123456789'))

// JSON de la config
const cfg = redact('{"access_token":"secret-AT","refresh_token":"secret-RT","name":"Steve"}')
assert.ok(!cfg.includes('secret-AT') && !cfg.includes('secret-RT'))
assert.ok(cfg.includes('Steve'))

// capçalera Bearer
assert.ok(!redact('Authorization: Bearer abc.def-ghi').includes('abc.def-ghi'))

console.log('applog: all OK')
