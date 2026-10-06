'use strict'
// Telemetria mínima i anònima, OPT-IN (docs/web-i-telemetria/01-telemetria.md). Només s'envia si l'usuari ha marcat la casella
// (separada, desmarcada per defecte) o ha activat l'ajust, i mai en mode desenvolupador. Contingut EXACTE del senyal:
// `{ v, id, version, os }` — l'identificador és un UUID aleatori generat aquí, sense relació amb el compte ni l'ordinador.
// Mai nom de jugador, UUID de Minecraft, tokens, servidors ni dades del joc. El renderer no veu mai l'identificador.
const crypto = require('node:crypto')

const ENDPOINT = 'https://hellmcclient.sergidalmau.dev/api/telemetry'
const OS_NAMES = { win32: 'win', darwin: 'mac', linux: 'linux' }
const HOUR = 60 * 60 * 1000
const TIMEOUT_MS = 5000

/**
 * @param {Object} deps
 * @param {() => Object} deps.getLegal Bloc `legal` de la config (`telemetryOptIn`, `termsAcceptedVersion`, `telemetryId`, `telemetryForget`).
 * @param {(patch: Object) => void} deps.setLegal
 * @param {() => void} deps.save
 * @param {() => number} deps.termsVersion Versió vigent dels termes (si no l'ha acceptada, no s'envia res).
 * @param {string} deps.appVersion
 * @param {string} deps.platform `process.platform`
 * @param {boolean} deps.isDev
 * @param {typeof fetch} [deps.fetchFn]
 * @param {() => string} [deps.uuid]
 * @param {() => number} [deps.random]
 */
function create(deps) {
    const { getLegal, setLegal, save, termsVersion, appVersion, platform, isDev } = deps
    const fetchFn = deps.fetchFn ?? ((...args) => fetch(...args))
    const uuid = deps.uuid ?? (() => crypto.randomUUID())
    const random = deps.random ?? Math.random
    const os = OS_NAMES[platform] ?? null
    let timer = null

    const eligible = () => {
        const legal = getLegal()
        return !isDev && os !== null && legal.telemetryOptIn === true && legal.termsAcceptedVersion === termsVersion()
    }

    async function post(path, body) {
        const res = await fetchFn(ENDPOINT + path, {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify(body),
            signal: AbortSignal.timeout(TIMEOUT_MS)
        })
        return res.ok
    }

    function ensureId() {
        let id = getLegal().telemetryId
        if (typeof id !== 'string' || id === '') {
            id = uuid()
            setLegal({ telemetryId: id })
            save()
        }
        return id
    }

    /** Un senyal. Mai llança: la telemetria no pot trencar ni endarrerir res. */
    async function ping() {
        if (!eligible()) return
        try {
            await post('/ping', { v: 1, id: ensureId(), version: appVersion, os })
        } catch {
            /* sense xarxa o servidor caigut: es tornarà a provar al cicle següent */
        }
    }

    /** Reintenta la petició de supressió pendent (si en va quedar una). */
    async function flushForget() {
        if (isDev) return
        const id = getLegal().telemetryForget
        if (typeof id !== 'string' || id === '') return
        try {
            if (await post('/forget', { id })) {
                setLegal({ telemetryForget: null })
                save()
            }
        } catch {
            /* es reintentarà a la propera arrencada */
        }
    }

    function stopTimer() {
        if (timer !== null) clearTimeout(timer)
        timer = null
    }

    function schedule(delayMs) {
        stopTimer()
        timer = setTimeout(async () => {
            await ping()
            // Cada 24 h ± 1 h mentre el client és obert.
            if (eligible()) schedule(23 * HOUR + random() * 2 * HOUR)
        }, delayMs)
        timer.unref?.()
    }

    return {
        /** A l'arrencada: primer senyal passats 20–60 s, i després cada dia. */
        start() {
            void flushForget()
            if (eligible()) schedule(20_000 + random() * 40_000)
        },
        /** Després que l'usuari canviï el consentiment (casella o ajust). */
        async onConsentChanged() {
            if (eligible()) {
                ensureId()
                schedule(2000 + random() * 3000)
            } else {
                await this.disable()
            }
        },
        /** Retira el consentiment: s'aturen els senyals, s'esborra l'id local i es demana al servidor que esborri el seu rastre. */
        async disable() {
            stopTimer()
            const id = getLegal().telemetryId
            if (typeof id === 'string' && id !== '') {
                setLegal({ telemetryId: null, telemetryForget: id })
                save()
            }
            await flushForget()
        },
        stop: stopTimer,
        // Només per a proves
        _ping: ping
    }
}

module.exports = { create, ENDPOINT }
