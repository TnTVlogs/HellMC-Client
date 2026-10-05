'use strict'
// S4: el preload (sandboxed) duplica les constants d'`ipcconstants.js`; han de ser idèntiques.
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const constants = require('../app/assets/js/ipcconstants')

const source = fs.readFileSync(path.join(__dirname, '..', 'src-node', 'preload.js'), 'utf8')

function extract(name) {
    const match = new RegExp(`const ${name} = (\\{[\\s\\S]*?\\})\\r?\\n`).exec(source)
    assert.ok(match, `${name} no trobat al preload`)
    return new Function(`return ${match[1]}`)()
}

assert.deepEqual(extract('MSFT_OPCODE'), constants.MSFT_OPCODE)
assert.deepEqual(extract('MSFT_REPLY_TYPE'), constants.MSFT_REPLY_TYPE)
assert.deepEqual(extract('MSFT_ERROR'), constants.MSFT_ERROR)
assert.ok(!/require\('\.\.\//.test(source), 'el preload sandboxed no pot fer require de fitxers locals')

console.log('preload-constants: all OK')
