'use strict'
// B2: `config.json` atòmic, recuperació des de `.bak` i cap pèrdua silenciosa de comptes.
const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const Module = require('node:module')

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'hellmc-cfg-'))
const userData = path.join(root, 'userData')
// Mai tocar el `config.json` heretat real de la màquina de desenvolupament.
process.env.APPDATA = path.join(root, 'appdata')
process.env.HOME = path.join(root, 'home')

const originalLoad = Module._load
Module._load = function (request, ...rest) {
    if (request === 'electron') {
        return {
            app: { getPath: () => userData },
            // xifratge fals però reversible: prou per comprovar que el fitxer no porta el token en clar
            safeStorage: { isEncryptionAvailable: () => true, encryptString: (v) => Buffer.from('X' + v), decryptString: (b) => b.toString().slice(1) }
        }
    }
    return originalLoad.call(this, request, ...rest)
}

const ConfigManager = require('../app/assets/js/configmanager')
const cfgPath = path.join(userData, 'config.json')

// primera execució: es crea
ConfigManager.load()
assert.ok(fs.existsSync(cfgPath))

// un compte desat sobreviu a una recàrrega; `save` no deixa fitxers temporals
ConfigManager.addMojangAuthAccount('uuid-1', 'tok', 'Steve', 'Steve')
ConfigManager.save()
ConfigManager.save() // la segona crea `.bak` amb el compte
assert.ok(!fs.existsSync(`${cfgPath}.tmp`))
assert.ok(fs.existsSync(`${cfgPath}.bak`))
ConfigManager.load()
assert.equal(ConfigManager.getAuthAccounts()['uuid-1'].displayName, 'Steve')

// fitxer truncat: es recupera des de `.bak` i es conserva el trencat apartat
fs.writeFileSync(cfgPath, '{"settings": {"game"')
ConfigManager.load()
assert.equal(ConfigManager.getAuthAccounts()['uuid-1'].displayName, 'Steve', 'compte recuperat de .bak')
assert.ok(fs.readdirSync(userData).some((f) => f.startsWith('config.json.corrupt-')), 'còpia del fitxer trencat')

// sense `.bak`: valors per defecte, però el trencat es conserva
fs.rmSync(`${cfgPath}.bak`)
fs.writeFileSync(cfgPath, 'no és JSON')
ConfigManager.load()
assert.deepEqual(ConfigManager.getAuthAccounts(), {})

// S5: els tokens es desen xifrats i a memòria són en clar després de `unlockSecrets`
ConfigManager.addMicrosoftAuthAccount('ms-1', 'mc-token-SECRET', 'Alex', 123, 'ms-access-SECRET', 'ms-refresh-SECRET', 456)
ConfigManager.save()
const onDisk = fs.readFileSync(cfgPath, 'utf8')
assert.ok(!onDisk.includes('SECRET'), 'cap token en clar al fitxer')
assert.ok(onDisk.includes('"accessToken": "enc:'))
assert.equal(ConfigManager.getAuthAccounts()['ms-1'].microsoft.refresh_token, 'ms-refresh-SECRET', 'a memòria segueix en clar')
ConfigManager.load() // arrencada nova: llegeix `enc:`
assert.ok(ConfigManager.getAuthAccounts()['ms-1'].microsoft.refresh_token.startsWith('enc:'))
assert.equal(ConfigManager.unlockSecrets(), true)
assert.equal(ConfigManager.getAuthAccounts()['ms-1'].microsoft.refresh_token, 'ms-refresh-SECRET')
assert.equal(ConfigManager.getAuthAccounts()['ms-1'].accessToken, 'mc-token-SECRET')
assert.ok(!fs.readFileSync(cfgPath, 'utf8').includes('SECRET'), 'després de desxifrar, el fitxer continua xifrat')
ConfigManager.removeAuthAccount('ms-1')
ConfigManager.save()

// DEFAULT_CONFIG no s'ha de mutar (abans `config = DEFAULT_CONFIG` compartia la referència)
ConfigManager.setGameWidth(1920)
assert.equal(ConfigManager.getGameWidth(true), 1280)

Module._load = originalLoad
fs.rmSync(root, { recursive: true, force: true })
console.log('configmanager: all OK')
