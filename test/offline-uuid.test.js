'use strict'
// S13: l'UUID d'un compte offline és l'estàndard de Minecraft (`UUID.nameUUIDFromBytes("OfflinePlayer:" + nom)`).
const assert = require('node:assert/strict')
const Module = require('node:module')

const originalLoad = Module._load
Module._load = function (request, ...rest) {
    if (request === 'electron') return { app: { getPath: () => '.' } }
    return originalLoad.call(this, request, ...rest)
}
const { offlineUuid } = require('../app/assets/js/authmanager')
Module._load = originalLoad

// vector conegut de Minecraft: el jugador «Notch» en un servidor offline
assert.equal(offlineUuid('Notch'), 'b50ad385-829d-3141-a216-7e7d7539ba7f')
// versió 3 i variant IETF
assert.match(offlineUuid('Steve'), /^[0-9a-f]{8}-[0-9a-f]{4}-3[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/)
// diferent per a cada nom, estable per a un mateix nom (és sensible a majúscules, com al joc)
assert.notEqual(offlineUuid('Steve'), offlineUuid('steve'))
assert.equal(offlineUuid('Steve'), offlineUuid('Steve'))

console.log('offline-uuid: all OK')
