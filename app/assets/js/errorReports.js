'use strict'
// Informes d'errors (docs/pendents/plans/08-informes-d-errors.md). Dues vies cap al mateix endpoint:
//  - automàtica: només amb la casella pròpia `legal.errorReportOptIn` (desmarcada per defecte); porta l'id de telemetria
//    NOMÉS si també hi ha opt-in d'ús;
//  - puntual: una fallada greu amb l'opt-in apagat es DESA a disc i mai s'envia sense que l'usuari premi el botó del diàleg
//    de la propera arrencada; sense cap identificador.
// Mai en mode dev, mai sense termes acceptats. Tot el que surt passa abans per `sanitizeEvent` (llista tancada de camps,
// rutes/tokens/UUID/correus/noms fora). Mai llança: informar d'un error no pot provocar-ne un altre.
const crypto = require('node:crypto')
const fs = require('node:fs')
const path = require('node:path')

const ENDPOINT = 'https://hellmcclient.sergidalmau.dev/api/telemetry/error'
const OS_NAMES = { win32: 'win', darwin: 'mac', linux: 'linux' }
const KINDS = ['main', 'renderer', 'child', 'game']
const TIMEOUT_MS = 5000
const HOUR = 60 * 60 * 1000
const DAY = 24 * HOUR

const MAX_MESSAGE = 500
const MAX_STACK_BYTES = 8 * 1024
const MAX_LOG_LINES = 40
const MAX_LOG_LINE = 300
const MAX_NAME = 100
const MAX_QUEUE_ENTRIES = 20
const MAX_QUEUE_BYTES = 64 * 1024
const MAX_PER_HOUR = 5
const PROMPT_INTERVAL_MS = HOUR
const ENTRY_TTL_MS = 7 * DAY

// ---------------------------------------------------------------------------------------------------------------------
// Neteja (pura, provada a test/errorReports.test.js)
// ---------------------------------------------------------------------------------------------------------------------

const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

/** Una ruta coneguda en les seves variants (separadors `\` i `/`, minúscules a Windows). */
function pathVariants(p) {
    if (typeof p !== 'string' || p.length < 4) return []
    const trimmed = p.replace(/[\\/]+$/, '')
    return [...new Set([trimmed, trimmed.replace(/\\/g, '/'), trimmed.replace(/\//g, '\\')])]
}

/**
 * @param {unknown} input
 * @param {Object} [ctx]
 * @param {string[]} [ctx.paths] Rutes conegudes → etiqueta: `[['C:\\Users\\x\\AppData\\...', '<userData>'], …]` (`ctx.replacements`)
 * @param {Array<[string, string]>} [ctx.replacements]
 * @param {string[]} [ctx.names] Noms de jugador coneguts.
 */
function sanitizeText(input, ctx = {}) {
    let out = String(input ?? '')
    // 1) rutes conegudes, les més llargues primer (la de la instància abans que la de dades abans que `~`)
    const known = []
    for (const [p, label] of ctx.replacements ?? []) for (const v of pathVariants(p)) known.push([v, label])
    known.sort((a, b) => b[0].length - a[0].length)
    for (const [p, label] of known) out = out.replace(new RegExp(escapeRe(p), 'gi'), label)
    // 2) rutes genèriques d'usuari (Windows, macOS, Linux; també com a URL `file:///`)
    out = out.replace(/file:\/\/\/?/gi, 'file:///')
    out = out.replace(/(?:file:\/\/\/)?[A-Za-z]:[\\/]+Users[\\/]+[^\\/\s:'"`)<>|]+/gi, '~')
    out = out.replace(/\/(?:Users|home)\/[^/\s:'"`)<>|]+/g, '~')
    out = out.replace(/%USERPROFILE%|%APPDATA%|%LOCALAPPDATA%/gi, '~')
    // 3) credencials
    out = out.replace(/Bearer\s+[A-Za-z0-9._~+/=-]+/gi, 'Bearer [REDACTED]')
    out = out.replace(/eyJ[A-Za-z0-9_-]{6,}\.[A-Za-z0-9_-]{6,}\.[A-Za-z0-9_-]*/g, '[REDACTED-JWT]')
    out = out.replace(/\b(access_token|refresh_token|id_token|token|authorization|password|passwd|secret|api[_-]?key|sessionid|signature)(["']?\s*[:=]\s*["']?)[^\s"'&,;)}]+/gi, '$1$2[REDACTED]')
    // 4) URL: mai amb query ni fragment
    out = out.replace(/(https?:\/\/[^\s?#"'`<>)]+)[?#][^\s"'`<>)]*/gi, '$1')
    // 5) UUID (amb o sense guionets), correus
    out = out.replace(/\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/gi, '<uuid>')
    out = out.replace(/\b[0-9a-f]{32}\b/gi, '<uuid>')
    out = out.replace(/[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)+/g, '<email>')
    // 6) cadenes llargues opaques (tokens que cap regla anterior ha reconegut)
    out = out.replace(/\b[A-Za-z0-9_-]{40,}\b/g, '[REDACTED]')
    // 7) noms de jugador coneguts (paraula sencera, sense distingir majúscules)
    for (const name of ctx.names ?? []) {
        if (typeof name !== 'string' || name.trim().length < 3) continue
        out = out.replace(new RegExp(`(?<![A-Za-z0-9_])${escapeRe(name.trim())}(?![A-Za-z0-9_])`, 'gi'), '<player>')
    }
    return out
}

/** Talla per bytes UTF-8 (sense partir un caràcter). */
function truncateBytes(text, maxBytes) {
    if (Buffer.byteLength(text, 'utf8') <= maxBytes) return text
    let cut = text.slice(0, maxBytes)
    while (Buffer.byteLength(cut, 'utf8') > maxBytes - 3) cut = cut.slice(0, -1)
    return `${cut}...`
}

function truncateChars(text, max) {
    return text.length <= max ? text : `${text.slice(0, max - 3)}...`
}

/**
 * Esdeveniment net i tancat (§4). `raw` és el que han capturat els ganxos; `env` són dades de l'entorn.
 * Retorna sempre un objecte amb exactament els camps permesos (sense `mode`/`id`: els posa qui envia o desa).
 */
function sanitizeEvent(raw, env, ctx = {}) {
    const kind = KINDS.includes(raw?.kind) ? raw.kind : 'main'
    const event = {
        v: 1,
        kind,
        name: truncateChars(sanitizeText(raw?.name || 'Error', ctx), MAX_NAME),
        message: truncateChars(sanitizeText(raw?.message ?? '', ctx), MAX_MESSAGE),
        stack: truncateBytes(sanitizeText(raw?.stack ?? '', ctx), MAX_STACK_BYTES),
        clientVersion: truncateChars(String(env.clientVersion ?? ''), 40),
        os: env.os,
        osVersion: truncateChars(String(env.osVersion ?? ''), 60),
        arch: truncateChars(String(env.arch ?? ''), 20),
        electron: truncateChars(String(env.electron ?? ''), 40)
    }
    if (typeof env.gpu === 'string' && env.gpu !== '') event.gpu = truncateChars(sanitizeText(env.gpu, ctx), MAX_NAME)
    const lines = Array.isArray(raw?.lastLog) ? raw.lastLog : typeof raw?.lastLog === 'string' ? raw.lastLog.split(/\r?\n/) : []
    const clean = lines
        .slice(-MAX_LOG_LINES)
        .map((l) => truncateChars(sanitizeText(l, ctx), MAX_LOG_LINE))
        .filter((l) => l !== '')
    // `lastLog` viatja com un sol text (línies separades per `\n`), com a màxim 40 línies.
    if (clean.length > 0) event.lastLog = clean.join('\n')
    return event
}

/** Empremta local per deduplicar: tipus + nom + primeres 5 línies de la traça sense línia/columna. */
function fingerprint(event) {
    const frames = String(event.stack ?? '')
        .split(/\r?\n/)
        .filter((l) => /^\s*at\s/.test(l))
        .slice(0, 5)
        .map((l) => l.replace(/:\d+(:\d+)?\)?$/, '').trim())
    const basis = [event.kind, event.name, frames.length > 0 ? frames.join('|') : event.message.slice(0, 120)].join('\n')
    return crypto.createHash('sha1').update(basis).digest('hex').slice(0, 16)
}

// ---------------------------------------------------------------------------------------------------------------------
// Mòdul
// ---------------------------------------------------------------------------------------------------------------------

/**
 * @param {Object} deps
 * @param {() => Object} deps.getLegal Bloc `legal` (`errorReportOptIn`, `crashPromptDisabled`, `crashPromptAt`, `telemetryOptIn`, `telemetryId`, `termsAcceptedVersion`).
 * @param {(patch: Object) => void} deps.setLegal
 * @param {() => void} deps.save
 * @param {() => number} deps.termsVersion
 * @param {string} deps.appVersion
 * @param {string} deps.platform `process.platform`
 * @param {string} [deps.osVersion]
 * @param {string} [deps.arch]
 * @param {string} [deps.electronVersion]
 * @param {() => string|null} [deps.getGpu]
 * @param {boolean} deps.isDev
 * @param {string} deps.queueFile Ruta de `userData/error-queue.json`.
 * @param {() => { replacements?: Array<[string,string]>, names?: string[] }} [deps.getContext] Rutes i noms coneguts (cada cop, canvien).
 * @param {() => string[]} [deps.getLastLog] Cua del log del launcher (ja redactada o no: es torna a netejar).
 * @param {typeof fetch} [deps.fetchFn]
 * @param {() => number} [deps.now]
 * @param {typeof fs} [deps.fsImpl]
 */
function create(deps) {
    const { getLegal, setLegal, save, termsVersion, appVersion, platform, isDev, queueFile } = deps
    const fetchFn = deps.fetchFn ?? ((...args) => fetch(...args))
    const now = deps.now ?? Date.now
    const fsImpl = deps.fsImpl ?? fs
    const os = OS_NAMES[platform] ?? null
    const seen = new Set() // empremtes ja vistes en aquesta sessió
    let recent = [] // marques de temps (última hora) dels errors acceptats
    let promptShown = false
    let flushing = false

    const baseEligible = () => !isDev && os !== null && getLegal().termsAcceptedVersion === termsVersion()
    const autoOn = () => baseEligible() && getLegal().errorReportOptIn === true

    // ---- cua a disc ------------------------------------------------------------------------------------------------
    function readQueue() {
        try {
            const data = JSON.parse(fsImpl.readFileSync(queueFile, 'utf8'))
            if (data?.v === 1 && Array.isArray(data.entries)) {
                const limit = now() - ENTRY_TTL_MS
                return data.entries.filter((e) => e && typeof e.fp === 'string' && e.event && (e.mode === 'auto' || e.mode === 'prompt') && e.at > limit)
            }
        } catch {
            /* sense fitxer o corrupte: cua buida */
        }
        return []
    }

    function writeQueue(entries) {
        try {
            let list = entries.slice(-MAX_QUEUE_ENTRIES)
            while (list.length > 1 && Buffer.byteLength(JSON.stringify({ v: 1, entries: list }), 'utf8') > MAX_QUEUE_BYTES) list = list.slice(1)
            if (list.length === 0) {
                fsImpl.rmSync(queueFile, { force: true })
                return
            }
            fsImpl.mkdirSync(path.dirname(queueFile), { recursive: true })
            const tmp = `${queueFile}.tmp`
            fsImpl.writeFileSync(tmp, JSON.stringify({ v: 1, entries: list }))
            fsImpl.renameSync(tmp, queueFile)
        } catch {
            /* disc ple o sense permisos: l'informe es perd, no passa res */
        }
    }

    function env() {
        let gpu = null
        try { gpu = deps.getGpu?.() ?? null } catch { /* ignora */ }
        return { clientVersion: appVersion, os, osVersion: deps.osVersion, arch: deps.arch, electron: deps.electronVersion, gpu }
    }

    function context() {
        try { return deps.getContext?.() ?? {} } catch { return {} }
    }

    /** Cos exacte de la petició. `id` només a la via automàtica i amb opt-in d'ús. Pura respecte a la cua. */
    function buildBody(entry, withId) {
        const body = { ...entry.event, mode: entry.mode }
        if (withId && entry.mode === 'auto') {
            const legal = getLegal()
            if (legal.telemetryOptIn === true && typeof legal.telemetryId === 'string' && legal.telemetryId !== '') body.id = legal.telemetryId
        }
        return body
    }

    async function post(body) {
        const res = await fetchFn(ENDPOINT, {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify(body),
            signal: AbortSignal.timeout(TIMEOUT_MS)
        })
        return res
    }

    /** Envia les entrades `auto` de la cua. Si la xarxa falla, es deixen per a la propera vegada. */
    async function flush() {
        if (flushing || !autoOn()) return
        flushing = true
        try {
            let entries = readQueue()
            for (const entry of entries.filter((e) => e.mode === 'auto')) {
                let res
                try {
                    res = await post(buildBody(entry, true))
                } catch {
                    break
                }
                // 2xx enviat; 4xx (cos rebutjat) no es reintenta mai; 5xx/429 es deixa.
                if (res.ok || (res.status >= 400 && res.status < 500 && res.status !== 429)) {
                    entries = readQueue().filter((e) => !(e.fp === entry.fp && e.at === entry.at))
                    writeQueue(entries)
                } else break
            }
        } catch {
            /* mai llança */
        } finally {
            flushing = false
        }
    }

    /**
     * Captura un error. `raw`: `{ kind, name, message, stack, lastLog?, severe? }`. Síncron respecte al disc (el procés pot
     * estar morint); l'enviament automàtic és asíncron. Retorna una promesa que no es rebutja mai.
     */
    function capture(raw) {
        try {
            if (!baseEligible()) return Promise.resolve(false)
            const auto = autoOn()
            if (!auto && raw?.severe !== true) return Promise.resolve(false)
            const c = context()
            let lastLog = raw.lastLog
            if (lastLog == null) {
                try { lastLog = deps.getLastLog?.() } catch { /* ignora */ }
            }
            const event = sanitizeEvent({ ...raw, lastLog }, env(), c)
            const fp = fingerprint(event)
            if (seen.has(fp)) return Promise.resolve(false)
            const t = now()
            recent = recent.filter((x) => t - x < HOUR)
            if (recent.length >= MAX_PER_HOUR) return Promise.resolve(false)
            seen.add(fp)
            recent.push(t)
            const mode = auto ? 'auto' : 'prompt'
            const entries = readQueue().filter((e) => e.fp !== fp)
            entries.push({ fp, at: t, mode, event })
            writeQueue(entries)
            return auto ? flush().then(() => true) : Promise.resolve(true)
        } catch {
            return Promise.resolve(false)
        }
    }

    // ---- via puntual -----------------------------------------------------------------------------------------------
    const promptEntries = () => readQueue().filter((e) => e.mode === 'prompt')

    return {
        capture,
        /** A l'arrencada: envia el que hagués quedat a la cua si hi ha opt-in. */
        start() {
            void flush()
        },
        /**
         * Informe greu pendent per preguntar a l'usuari, o `null`. Només un cop per arrencada i com a màxim un per hora;
         * només si l'opt-in és apagat i no s'ha marcat «No ho tornis a preguntar». `json` és EXACTAMENT el que s'enviaria.
         */
        getPendingPrompt() {
            try {
                const legal = getLegal()
                if (!baseEligible() || promptShown || legal.errorReportOptIn === true || legal.crashPromptDisabled === true) return null
                if (typeof legal.crashPromptAt === 'number' && now() - legal.crashPromptAt < PROMPT_INTERVAL_MS) return null
                const entries = promptEntries()
                if (entries.length === 0) return null
                const entry = entries[entries.length - 1]
                promptShown = true
                setLegal({ crashPromptAt: now() })
                save()
                const body = buildBody(entry, false)
                return { count: entries.length, report: body, json: JSON.stringify(body, null, 2) }
            } catch {
                return null
            }
        },
        /** `send` envia l'últim informe; `dismiss` l'esborra; `never` l'esborra i no torna a preguntar. Mai llança. */
        async answerPrompt(choice) {
            try {
                const entries = promptEntries()
                if (choice === 'send' && entries.length > 0 && baseEligible()) {
                    try {
                        await post(buildBody(entries[entries.length - 1], false))
                    } catch {
                        /* sense xarxa: es perd; l'usuari ja ha decidit */
                    }
                }
                if (choice === 'never') {
                    setLegal({ crashPromptDisabled: true })
                    save()
                }
                writeQueue(readQueue().filter((e) => e.mode !== 'prompt'))
            } catch {
                /* mai llança */
            }
        },
        /** Després de canviar la casella: si es retira, s'esborra el que quedava pendent d'enviar automàticament. */
        async onConsentChanged() {
            if (getLegal().errorReportOptIn === true) await flush()
            else writeQueue(readQueue().filter((e) => e.mode !== 'auto'))
        },
        /** Esborra tota la cua (D16 «esborra les dades»). */
        clear() {
            writeQueue([])
        },
        // Només per a proves
        _flush: flush,
        _readQueue: readQueue,
        _autoOn: autoOn
    }
}

module.exports = { create, sanitizeText, sanitizeEvent, fingerprint, truncateBytes, ENDPOINT, MAX_QUEUE_ENTRIES, MAX_QUEUE_BYTES, MAX_PER_HOUR }
