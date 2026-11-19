'use strict'
// Client social del launcher (docs/pendents/plans/11-social-f4.md): una connexió WebSocket al relay de HellMC, SENSE el joc obert,
// per veure i gestionar els amics. Mateix protocol i mateix permís de sessió que el runtime (plans/09): `RelayAuth.authenticate`
// fa el `join` a Mojang i el relay ens dona un token; el token d'accés de Minecraft no surt mai cap al relay.
//
// Tot és opt-in: només es connecta si l'usuari ha activat «Amics» (consentiment al renderer) i té un compte Microsoft. L'estat que
// veu la interfície (`getState`) és una còpia del que diu el relay: aquí no es desa res al disc.
// Mai llança cap error cap al procés principal: qualsevol fallada deixa l'estat a `error`/`offline` i es reintenta amb espera creixent.

const BACKOFF_MS = [2000, 5000, 15000, 30000, 60000]
const HEARTBEAT_MS = 25000
const REFRESH_CHECK_MS = 60000
/** Demana un token nou quan queda menys del 20 % de les 12 h del relay (igual que el runtime). */
const REFRESH_BEFORE_MS = 144 * 60000
const REFRESH_RETRY_MS = 10 * 60000
const ACTION_TIMEOUT_MS = 8000

const isUuid32 = (s) => typeof s === 'string' && /^[0-9a-f]{32}$/.test(s)
const isShort = (s, max) => typeof s === 'string' && s.length > 0 && s.length <= max

/** Accions que el renderer pot demanar → missatge del relay (o `null` si els paràmetres no són vàlids). */
function buildMessage(op, p) {
    p = p != null && typeof p === 'object' ? p : {}
    switch (op) {
        case 'add':
            // `query`: cerca única (el relay prova codi i després nom; un nom de 8 caràcters pot semblar un codi).
            if (isShort(p.query, 16)) return { t: 'friend_add', q: p.query }
            if (isShort(p.code, 16)) return { t: 'friend_add', code: p.code }
            if (isShort(p.name, 16)) return { t: 'friend_add', name: p.name }
            return null
        case 'respond':
            return isUuid32(p.uuid) && typeof p.accept === 'boolean' ? { t: 'friend_respond', uuid: p.uuid, accept: p.accept } : null
        case 'remove':
        case 'block':
        case 'unblock':
            return isUuid32(p.uuid) ? { t: `friend_${op}`, uuid: p.uuid } : null
        case 'settings': {
            const m = { t: 'social_settings' }
            if (p.status !== undefined) { if (!['online', 'busy', 'invisible'].includes(p.status)) return null; m.status = p.status }
            if (p.hideServer !== undefined) { if (typeof p.hideServer !== 'boolean') return null; m.hideServer = p.hideServer }
            if (p.allowRequests !== undefined) { if (!['all', 'none'].includes(p.allowRequests)) return null; m.allowRequests = p.allowRequests }
            return Object.keys(m).length > 1 ? m : null
        }
        case 'export':
            return { t: 'social_export' }
        case 'delete':
            return { t: 'social_delete' }
        default:
            return null
    }
}

const EMPTY = () => ({ phase: 'off', enabled: false, me: null, friends: [], incoming: [], outgoing: [], blocked: [], error: null })

/**
 * @param {object} deps
 * @param {() => Promise<{token: string, expiresAt: number}|null>} deps.authenticate fa el join amb Mojang i demana el token al relay
 * @param {() => boolean} deps.wanted l'usuari ha activat Amics (consentiment) i hi ha un compte Microsoft
 * @param {string} deps.url `wss://…/ws`
 * @param {new (url: string) => any} deps.WebSocketImpl
 * @param {(state: object) => void} [deps.onState]
 * @param {(event: object) => void} [deps.onEvent] `{kind:'request'|'accepted'|'online', uuid, name}`
 * @param {number[]} [deps.backoffMs]
 */
function create({ authenticate, wanted, url, WebSocketImpl, onState = () => {}, onEvent = () => {}, onRemote = () => {}, now = Date.now, backoffMs = BACKOFF_MS, probeMs = 6000, log = () => {} }) {
    let state = EMPTY()
    let ws = null
    let session = null // { token, expiresAt }
    let attempt = 0
    let reconnectTimer = null
    let timers = []
    let running = false
    let lastRefresh = 0
    let generation = 0
    /** Sense consentiment local: només es connecta per saber si Amics s'ha activat des del joc (i desa res). */
    let probing = false
    let probeTimer = null
    /** L'usuari acaba d'acceptar a la interfície: s'envia `social_enable` en estar en línia. */
    let pendingEnable = false
    /** Esperes d'una resposta concreta: clau → [{resolve, timer}] */
    const waiting = new Map()

    function setState(patch) {
        state = { ...state, ...patch }
        try { onState(getState()) } catch { /* la interfície no ha de trencar el client */ }
    }

    function getState() {
        return JSON.parse(JSON.stringify(state))
    }

    function clearTimers() {
        for (const t of timers) clearInterval(t)
        timers = []
    }

    function wake(key, value) {
        const list = waiting.get(key)
        if (!list) return
        waiting.delete(key)
        for (const w of list) { clearTimeout(w.timer); w.resolve(value) }
    }

    function wait(key) {
        return new Promise((resolve, reject) => {
            const w = { resolve, timer: setTimeout(() => { const l = waiting.get(key); if (l) waiting.set(key, l.filter((x) => x !== w)); reject(new Error('SOCIAL_ERROR:TIMEOUT')) }, ACTION_TIMEOUT_MS) }
            if (w.timer.unref) w.timer.unref()
            const list = waiting.get(key) ?? []
            list.push(w)
            waiting.set(key, list)
        })
    }

    function raw(msg) {
        if (ws && ws.readyState === 1) ws.send(JSON.stringify(msg))
    }

    function scheduleReconnect(extra = 0) {
        if (!running) return
        const delay = Math.max(extra, backoffMs[Math.min(attempt, backoffMs.length - 1)])
        attempt++
        clearTimeout(reconnectTimer)
        reconnectTimer = setTimeout(() => void connect(), delay)
        if (reconnectTimer.unref) reconnectTimer.unref()
    }

    async function connect() {
        if (!running) return
        if (!wanted() && !probing) return stop()
        setState({ phase: 'connecting', error: null })
        try {
            if (session == null || session.expiresAt - now() < 60000) session = await authenticate()
        } catch (err) {
            log(`social: autenticació: ${err && err.message}`)
            session = null
        }
        if (!running) return
        if (session == null) {
            setState({ phase: 'error', error: 'auth' })
            return scheduleReconnect()
        }
        let socket
        try {
            socket = new WebSocketImpl(url)
        } catch (err) {
            log(`social: no s'ha pogut obrir: ${err && err.message}`)
            setState({ phase: 'error', error: 'network' })
            return scheduleReconnect()
        }
        ws = socket
        let ready = false
        let fatal = false
        socket.onopen = () => {
            if (ws !== socket) return
            raw({ t: 'hello', v: 1, token: session.token, clientVersion: 'launcher', mc: '' })
        }
        socket.onmessage = (ev) => {
            if (ws !== socket) return
            let msg
            try { msg = JSON.parse(typeof ev.data === 'string' ? ev.data : String(ev.data)) } catch { return }
            if (msg == null || typeof msg !== 'object') return
            switch (msg.t) {
                case 'ready':
                    ready = true
                    attempt = 0
                    setState({ phase: 'online', error: null })
                    // Mai s'activa Amics sol: l'estat real és el del relay (pot haver-se activat o pausat des del joc).
                    raw({ t: 'friends_get' })
                    if (pendingEnable) raw({ t: 'social_enable', value: true })
                    startTimers()
                    if (probing) {
                        clearTimeout(probeTimer)
                        probeTimer = setTimeout(() => { if (probing && !state.enabled) stop() }, probeMs)
                        if (probeTimer.unref) probeTimer.unref()
                    }
                    break
                case 'friends': {
                    const enabled = msg.me?.enabled === true
                    if (enabled) pendingEnable = false
                    if (enabled && probing) { probing = false; clearTimeout(probeTimer) }
                    try { onRemote(enabled) } catch { /* res */ }
                    setState({
                        enabled: msg.me?.enabled === true,
                        me: msg.me?.enabled === true ? msg.me : null,
                        friends: Array.isArray(msg.friends) ? msg.friends : [],
                        incoming: Array.isArray(msg.incoming) ? msg.incoming : [],
                        outgoing: Array.isArray(msg.outgoing) ? msg.outgoing : [],
                        blocked: Array.isArray(msg.blocked) ? msg.blocked : []
                    })
                    break
                }
                case 'friend_result':
                    if (typeof msg.op === 'string') wake(msg.op, msg.result)
                    break
                case 'friend_event':
                    try { onEvent({ kind: msg.kind, uuid: msg.uuid, name: msg.name }) } catch { /* res */ }
                    break
                case 'social_export':
                    wake('export', msg.data)
                    break
                case 'social_deleted':
                    setState({ enabled: false, me: null, friends: [], incoming: [], outgoing: [], blocked: [] })
                    wake('delete', 'ok')
                    break
                case 'token':
                    if (typeof msg.token === 'string' && typeof msg.expiresAt === 'number' && msg.expiresAt > (session?.expiresAt ?? 0)) {
                        session = { token: msg.token, expiresAt: msg.expiresAt }
                    }
                    break
                case 'bye':
                    if (msg.reason === 'auth') session = null // es torna a autenticar amb Mojang
                    if (msg.reason === 'version') { fatal = true; setState({ phase: 'error', error: 'version' }) }
                    break
                default:
                    break
            }
        }
        socket.onclose = () => {
            if (ws !== socket) return
            ws = null
            clearTimers()
            if (!running || fatal) return
            setState({ phase: ready ? 'connecting' : 'error', error: ready ? null : 'network' })
            scheduleReconnect(ready ? 0 : 0)
        }
        socket.onerror = () => { /* onclose ho gestiona */ }
    }

    function startTimers() {
        clearTimers()
        const hb = setInterval(() => raw({ t: 'ping' }), HEARTBEAT_MS)
        const rf = setInterval(() => {
            if (session && session.expiresAt - now() <= REFRESH_BEFORE_MS && now() - lastRefresh >= REFRESH_RETRY_MS) {
                lastRefresh = now()
                raw({ t: 'refresh' })
            }
        }, REFRESH_CHECK_MS)
        for (const t of [hb, rf]) if (t.unref) t.unref()
        timers = [hb, rf]
    }

    /**
     * Arrenca la connexió (si l'usuari ho ha activat i hi ha compte Microsoft). Idempotent. Amb `probe` i sense consentiment local, es connecta
     * només per saber si Amics s'ha activat des del joc: si no és així, es tanca sol als pocs segons.
     */
    function start({ probe = false } = {}) {
        if (running) return
        const consent = wanted()
        if (!consent && !probe) return
        probing = !consent
        generation++
        running = true
        attempt = 0
        void connect()
    }

    /** Tanca la connexió i deixa l'estat buit (Amics desactivat, canvi de compte, sortida). No esborra res al relay. */
    function stop() {
        running = false
        probing = false
        pendingEnable = false
        clearTimeout(probeTimer)
        clearTimeout(reconnectTimer)
        clearTimers()
        session = null
        for (const key of [...waiting.keys()]) wake(key, undefined)
        const s = ws
        ws = null
        try { if (s) s.close() } catch { /* ja tancat */ }
        setState(EMPTY())
    }

    /** `social_enable false` (pausa) i atura la connexió quan el missatge ja ha sortit. */
    function pause() {
        raw({ t: 'social_enable', value: false })
        running = false
        clearTimeout(reconnectTimer)
        const mine = ++generation
        const t = setTimeout(() => { if (mine === generation) stop() }, 150)
        if (t.unref) t.unref()
    }

    /**
     * Executa una acció del renderer. Retorna el resultat del relay (`friend_result.result`), les dades exportades, o `'ok'`.
     * Llança `SOCIAL_ERROR:<CODI>`.
     */
    async function act(op, payload) {
        const msg = buildMessage(op, payload)
        if (msg == null) throw new Error('SOCIAL_ERROR:INVALID')
        if (!ws || ws.readyState !== 1 || state.phase !== 'online') throw new Error('SOCIAL_ERROR:OFFLINE')
        const key = op === 'export' ? 'export' : op === 'delete' ? 'delete' : op
        if (op === 'settings') {
            raw(msg)
            return 'ok'
        }
        const answer = wait(key)
        raw(msg)
        const result = await answer
        if (result === undefined) throw new Error('SOCIAL_ERROR:OFFLINE')
        return result
    }

    /** L'usuari ha acceptat Amics a la interfície: s'activa al relay (ara, o quan hi hagi connexió). */
    function enable() {
        pendingEnable = true
        probing = false
        if (ws && ws.readyState === 1 && state.phase === 'online') raw({ t: 'social_enable', value: true })
    }

    return { start, stop, pause, enable, act, getState, isRunning: () => running, isEnabling: () => pendingEnable }
}

module.exports = { create, buildMessage, BACKOFF_MS }
