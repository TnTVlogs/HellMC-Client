'use strict'
// Autenticació amb el relay de HellMC (docs/pendents/plans/09-relay-i-auth.md §4).
//  1. El relay dóna un nonce (`serverId`).
//  2. Fem `join` a la sessió de Mojang amb el token d'accés de Minecraft i aquest nonce (el mateix que fa el joc en entrar a un
//     servidor online). El token d'accés NOMÉS va a Mojang: el relay no el veu mai.
//  3. El relay comprova amb `hasJoined` que aquest jugador hi ha fet `join` i ens dona un token de sessió (12 h).
// El token s'escriu a `<instància>/hellmc-relay.json` (només l'usuari el pot llegir) i el runtime el llegeix en arrencar.
// Tot és opcional: qualsevol fallada deixa el joc sense relay (cap insígnia dels altres) i mai impedeix jugar ni llança.
const crypto = require('node:crypto')
const fs = require('node:fs')
const path = require('node:path')

const DEFAULT_RELAY_BASE = 'https://hellmcrelay.sergidalmau.dev'
const MOJANG_SESSION = 'https://sessionserver.mojang.com'
const SESSION_FILE = 'hellmc-relay.json'
const INSTALL_ID_FILE = 'relay-install-id'
const TIMEOUT_MS = 5000

const isHex32 = (s) => typeof s === 'string' && /^[0-9a-f]{32}$/i.test(s.replace(/-/g, ''))

/**
 * @param {object} deps
 * @param {typeof fetch} deps.fetchFn
 * @param {string} deps.dataDir carpeta `userData` (aquí es desa l'identificador d'instal·lació)
 * @param {string} [deps.relayBase] URL https del relay (`HELLMC_RELAY_URL` per desenvolupament)
 * @param {() => number} [deps.now]
 * @param {(msg: string) => void} [deps.log]
 */
function create({ fetchFn, dataDir, relayBase = DEFAULT_RELAY_BASE, now = Date.now, log = () => {} }) {
    const base = relayBase.replace(/\/+$/, '')

    /** Identificador aleatori d'aquesta instal·lació (no és un secret d'identitat; serveix per a límits i, més endavant, comptes offline). */
    function installId() {
        const file = path.join(dataDir, INSTALL_ID_FILE)
        try {
            const v = fs.readFileSync(file, 'utf8').trim()
            if (/^[A-Za-z0-9_-]{8,64}$/.test(v)) return v
        } catch {
            /* es crea a sota */
        }
        const id = crypto.randomUUID()
        fs.mkdirSync(dataDir, { recursive: true })
        fs.writeFileSync(file, id)
        return id
    }

    const jsonFetch = async (url, body) => {
        const res = await fetchFn(url, {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify(body),
            redirect: 'error',
            signal: AbortSignal.timeout(TIMEOUT_MS)
        })
        return res
    }

    /**
     * @param {{uuid: string, displayName: string, accessToken: string}} account compte Microsoft ja validat
     * @returns {Promise<{token: string, expiresAt: number}|null>}
     */
    async function authenticate(account) {
        try {
            if (!account || !isHex32(account.uuid) || typeof account.accessToken !== 'string' || account.accessToken === '') return null
            const uuid = account.uuid.replace(/-/g, '').toLowerCase()
            const ch = await jsonFetch(`${base}/auth/challenge`, {})
            if (!ch.ok) return null
            const { serverId } = await ch.json()
            if (typeof serverId !== 'string' || !/^[0-9a-f]{40}$/.test(serverId)) return null

            const join = await jsonFetch(`${MOJANG_SESSION}/session/minecraft/join`, { accessToken: account.accessToken, selectedProfile: uuid, serverId })
            if (join.status !== 204 && join.status !== 200) {
                log(`relay: Mojang join ${join.status}`)
                return null
            }

            const v = await jsonFetch(`${base}/auth/verify`, { uuid, name: account.displayName, installId: installId(), serverId })
            if (!v.ok) {
                log(`relay: verify ${v.status}`)
                return null
            }
            const out = await v.json()
            if (typeof out.token !== 'string' || typeof out.expiresAt !== 'number' || out.expiresAt <= now()) return null
            return { token: out.token, expiresAt: out.expiresAt }
        } catch (err) {
            log(`relay: ${err && err.name ? err.name : 'error'}`)
            return null
        }
    }

    /** Esborra el fitxer de sessió (relay desactivat, compte offline o fallada): el runtime no connecta. */
    function clear(gameDir) {
        try {
            fs.rmSync(path.join(gameDir, SESSION_FILE), { force: true })
        } catch {
            /* no és crític */
        }
    }

    /**
     * Autentica i escriu `<gameDir>/hellmc-relay.json`. Retorna true si el runtime tindrà relay en aquesta partida.
     * Mai llança.
     */
    async function prepare(gameDir, account) {
        clear(gameDir)
        const session = await authenticate(account)
        if (session == null) return false
        try {
            const file = path.join(gameDir, SESSION_FILE)
            fs.writeFileSync(file, JSON.stringify({ v: 1, url: `${base.replace(/^http/, 'ws')}/ws`, token: session.token, expiresAt: session.expiresAt }), { mode: 0o600 })
            return true
        } catch {
            return false
        }
    }

    return { prepare, clear, authenticate, installId }
}

module.exports = { create, SESSION_FILE, DEFAULT_RELAY_BASE }
