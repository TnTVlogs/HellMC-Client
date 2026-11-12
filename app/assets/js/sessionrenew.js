'use strict'
// Autorenovació del token de Minecraft durant la partida (docs/pendents/plans/10-autorenovacio-de-tokens.md, part B).
// El joc rep el token d'accés UN sol cop per la línia d'ordres i caduca (~24 h): passat això no es pot entrar a servidors online
// sense reiniciar. Mentre la partida és oberta, el launcher (que és qui té el refresh token de Microsoft, que MAI surt d'aquí) refresca
// el compte d'aquella partida quan toca i deixa el token nou a `<instància>/hellmc-session.json` (mode 0600, escriptura atòmica);
// l'agent del joc (HellMC Runtime, `-Dhellmc.session`) el llegeix i el posa al lloc. En tancar-se el joc el fitxer s'esborra.
// Mai es registra el valor del token. Mai llança: la renovació és una comoditat i no pot afectar el joc.
const fs = require('node:fs')
const path = require('node:path')

const SESSION_FILE = 'hellmc-session.json'
const DEFAULT_INTERVAL_MS = 5 * 60 * 1000

/**
 * @param {object} deps
 * @param {(uuid: string) => Promise<'ok'|'offline'|'invalid'>} deps.refresh refresca el compte si cal (`AuthManager.validateAccountStatus`)
 * @param {(uuid: string) => ({accessToken: string, expiresAt: number|null, type: string}|undefined)} deps.getAccount
 * @param {number} [deps.intervalMs]
 * @param {(msg: string) => void} [deps.log]
 * @param {typeof setInterval} [deps.setIntervalFn]
 * @param {typeof clearInterval} [deps.clearIntervalFn]
 */
function create({ refresh, getAccount, intervalMs = DEFAULT_INTERVAL_MS, log = () => {}, setIntervalFn = setInterval, clearIntervalFn = clearInterval }) {
    const fileFor = (gameDir) => path.join(gameDir, SESSION_FILE)

    /** Esborra el fitxer de sessió (en arrencar una partida i en tancar-se). */
    function clear(gameDir) {
        try {
            fs.rmSync(fileFor(gameDir), { force: true })
        } catch {
            /* no és crític */
        }
    }

    function write(gameDir, uuid, account) {
        const file = fileFor(gameDir)
        const tmp = `${file}.${process.pid}.tmp`
        fs.writeFileSync(tmp, JSON.stringify({ v: 1, uuid, accessToken: account.accessToken, expiresAt: account.expiresAt }), { mode: 0o600 })
        fs.renameSync(tmp, file)
    }

    /**
     * Vigila el compte (uuid de 32 hex) d'una partida. Retorna `stop()`; cridar-lo en tancar-se el joc (esborra el fitxer).
     * `tick()` es pot cridar a mà (proves).
     */
    function watch(gameDir, uuid) {
        clear(gameDir)
        const initial = getAccount(uuid)
        let lastWritten = initial != null ? initial.accessToken : null
        let stopped = false
        let running = false
        let warned = false

        async function tick() {
            if (stopped || running) return
            running = true
            try {
                const status = await refresh(uuid)
                if (stopped) return
                if (status !== 'ok') {
                    if (!warned) log(`sessió: no s'ha pogut renovar el token (${status}); es reintentarà`)
                    warned = true
                    return
                }
                warned = false
                const account = getAccount(uuid)
                if (account == null || typeof account.accessToken !== 'string' || account.accessToken === '') return
                if (account.accessToken === lastWritten) return
                write(gameDir, uuid, account)
                lastWritten = account.accessToken
                log('sessió: token de Minecraft renovat i entregat al joc')
            } catch (err) {
                log(`sessió: error en renovar (${err && err.name ? err.name : 'error'})`)
            } finally {
                running = false
            }
        }

        const timer = setIntervalFn(() => void tick(), intervalMs)
        if (timer && typeof timer.unref === 'function') timer.unref()

        return {
            tick,
            stop() {
                if (stopped) return
                stopped = true
                clearIntervalFn(timer)
                clear(gameDir)
            }
        }
    }

    return { watch, clear }
}

module.exports = { create, SESSION_FILE, DEFAULT_INTERVAL_MS }
