#!/usr/bin/env node
'use strict'
// S1: eina per signar `distribution-v2.json` (Ed25519, signatura *detached* en base64). Es fa servir al TEU ordinador, mai al
// servidor: la clau privada no ha d'arribar-hi.
//
//   node scripts/distribution-signing.js keygen  <carpeta>                 genera la parella de claus (privada xifrada)
//   node scripts/distribution-signing.js sign    <clau-privada.pem> <fitxer>   escriu <fitxer>.sig
//   node scripts/distribution-signing.js verify  <clau-publica.pem> <fitxer>   comprova <fitxer> amb <fitxer>.sig
//
// La contrasenya de la clau privada es llegeix de HELLMC_SIGN_PASSPHRASE o es demana per terminal (sense eco).

const crypto = require('node:crypto')
const fs = require('node:fs')
const path = require('node:path')

function askPassphrase(prompt) {
    if (process.env.HELLMC_SIGN_PASSPHRASE) return Promise.resolve(process.env.HELLMC_SIGN_PASSPHRASE)
    return new Promise((resolve) => {
        process.stdout.write(prompt)
        const stdin = process.stdin
        let value = ''
        if (stdin.isTTY) stdin.setRawMode(true)
        stdin.resume()
        stdin.setEncoding('utf8')
        const onData = (chunk) => {
            for (const ch of chunk) {
                if (ch === '\r' || ch === '\n' || ch === '\u0004') {
                    if (stdin.isTTY) stdin.setRawMode(false)
                    stdin.pause()
                    stdin.off('data', onData)
                    process.stdout.write('\n')
                    resolve(value)
                    return
                }
                if (ch === '\u0003') process.exit(130)
                if (ch === '\u007f' || ch === '\b') value = value.slice(0, -1)
                else value += ch
            }
        }
        stdin.on('data', onData)
    })
}

async function keygen(dir) {
    if (!dir) throw new Error('Falta la carpeta de destinació')
    fs.mkdirSync(dir, { recursive: true })
    const privatePath = path.join(dir, 'hellmc-distribution-private.pem')
    const publicPath = path.join(dir, 'hellmc-distribution-public.pem')
    if (fs.existsSync(privatePath)) throw new Error(`Ja existeix ${privatePath}: no se sobreescriu`)
    const first = await askPassphrase('Contrasenya de la clau privada: ')
    if (first.length < 12) throw new Error('La contrasenya ha de tenir almenys 12 caràcters')
    if (!process.env.HELLMC_SIGN_PASSPHRASE) {
        const second = await askPassphrase('Repeteix-la: ')
        if (first !== second) throw new Error('Les contrasenyes no coincideixen')
    }
    const { publicKey, privateKey } = crypto.generateKeyPairSync('ed25519', {
        publicKeyEncoding: { type: 'spki', format: 'pem' },
        privateKeyEncoding: { type: 'pkcs8', format: 'pem', cipher: 'aes-256-cbc', passphrase: first }
    })
    fs.writeFileSync(privatePath, privateKey, { mode: 0o600 })
    fs.writeFileSync(publicPath, publicKey)
    console.log(`Clau privada (xifrada): ${privatePath}\nClau pública:            ${publicPath}`)
    console.log('\n1) Fes còpia XIFRADA de la privada en un USB. 2) No la pugis mai al servidor ni a un núvol en clar.')
    console.log('3) Enganxa la pública a app/assets/js/signing-keys.js (i una segona clau de reserva) per activar la verificació.')
}

async function signFile(privateKeyPath, file) {
    const passphrase = await askPassphrase('Contrasenya de la clau privada: ')
    const key = crypto.createPrivateKey({ key: fs.readFileSync(privateKeyPath), format: 'pem', passphrase })
    const data = fs.readFileSync(file)
    JSON.parse(data.toString('utf8')) // ha de ser JSON vàlid
    const signature = crypto.sign(null, data, key).toString('base64')
    fs.writeFileSync(`${file}.sig`, signature)
    console.log(`Signatura escrita a ${file}.sig (${data.length} bytes signats)`)
}

function verifyFile(publicKeyPath, file) {
    const key = crypto.createPublicKey(fs.readFileSync(publicKeyPath))
    const signature = Buffer.from(fs.readFileSync(`${file}.sig`, 'utf8').trim(), 'base64')
    const ok = crypto.verify(null, fs.readFileSync(file), key, signature)
    console.log(ok ? 'Signatura VÀLIDA' : 'Signatura INVÀLIDA')
    process.exit(ok ? 0 : 1)
}

async function main() {
    const [command, a, b] = process.argv.slice(2)
    if (command === 'keygen') return keygen(a)
    if (command === 'sign' && a && b) return signFile(a, b)
    if (command === 'verify' && a && b) return verifyFile(a, b)
    console.log('Ús: keygen <carpeta> | sign <clau-privada.pem> <fitxer> | verify <clau-publica.pem> <fitxer>')
    process.exit(2)
}

main().catch((err) => {
    console.error(`Error: ${err.message}`)
    process.exit(1)
})
