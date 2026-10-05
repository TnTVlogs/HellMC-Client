'use strict'
// S3/S4/S6: validacions d'entrada del procés principal. Mòdul pur (sense Electron) perquè sigui provable.

const path = require('path')

/** Només `https:`/`http:`: mai `file:`, manejadors de protocol (`ms-msdt:`…) ni res que pugui executar codi. */
function safeExternalUrl(raw) {
    if (typeof raw !== 'string' || raw.length > 4096) return null
    let url
    try {
        url = new URL(raw)
    } catch {
        return null
    }
    return url.protocol === 'https:' || url.protocol === 'http:' ? url.toString() : null
}

/**
 * Amfitrions que no han de ser accessibles des de feeds/URLs vingudes de la distribució (SSRF): *loopback*, xarxes privades,
 * *link-local* i noms locals. Només mira literals (no resol DNS).
 */
function isPrivateHost(hostname) {
    const host = String(hostname).toLowerCase().replace(/^\[|\]$/g, '')
    if (host === 'localhost' || host.endsWith('.localhost') || host.endsWith('.local') || host.endsWith('.internal')) return true
    const v4 = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(host)
    if (v4) {
        const [a, b] = [Number(v4[1]), Number(v4[2])]
        return a === 10 || a === 127 || a === 0 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127)
    }
    if (host.includes(':')) {
        return host === '::1' || host === '::' || host.startsWith('fe80:') || host.startsWith('fc') || host.startsWith('fd') || host.startsWith('::ffff:')
    }
    return false
}

/** URL de feed permesa: https i amfitrió públic. */
function safeFeedUrl(raw) {
    const url = safeExternalUrl(raw)
    if (url == null || !url.startsWith('https://')) return null
    return isPrivateHost(new URL(url).hostname) ? null : url
}

/** `child` és `base` o és a dins (després de resoldre `..` i enllaços relatius). */
function isInside(base, child) {
    const resolvedBase = path.resolve(base)
    const resolved = path.resolve(child)
    const relative = path.relative(resolvedBase, resolved)
    return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative))
}

/** `path.join` que mai surt de `base` (S6). Llança si la ruta relativa s'escapa. */
function safeJoin(base, ...parts) {
    const joined = path.join(base, ...parts)
    if (!isInside(base, joined)) {
        throw new Error(`Unsafe path: ${parts.join('/')}`)
    }
    return joined
}

/** Ids de versions/servidors: ASCII, sense separadors de ruta. */
function isValidId(id) {
    return typeof id === 'string' && /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/.test(id)
}

function isValidRam(value) {
    return typeof value === 'string' && /^[1-9]\d{0,5}[MG]$/.test(value)
}

/** Nom de compte *offline*: igual que la pantalla de Benvinguda. */
function isValidOfflineName(name) {
    return typeof name === 'string' && /^[A-Za-z0-9_]{3,16}$/.test(name.trim())
}

// Opcions de JVM que executen codi o carreguen biblioteques arbitràries: només amb el mode desenvolupador.
const DANGEROUS_JVM = /^-(javaagent|agentlib|agentpath|Xrunjdwp|Xbootclasspath|XX:OnError|XX:OnOutOfMemoryError|XX:\+?(Unlock)?DiagnosticVMOptions|XX:Flags|XX:VMOptionsFile)/i

/** Retorna `{ ok: true, options }` o `{ ok: false, reason }`. */
function validateJvmOptions(options, allowDangerous) {
    if (!Array.isArray(options) || options.length > 100) return { ok: false, reason: 'not-an-array' }
    for (const option of options) {
        if (typeof option !== 'string' || option.length === 0 || option.length > 300 || /[\r\n\0]/.test(option)) {
            return { ok: false, reason: 'invalid-option' }
        }
        if (!allowDangerous && DANGEROUS_JVM.test(option)) return { ok: false, reason: 'dangerous-option' }
    }
    return { ok: true, options }
}

const UI_KEYS = {
    theme: (v) => ['system', 'dark', 'light'].includes(v),
    performance: (v) => ['auto', 'on', 'off'].includes(v),
    uiScale: (v) => [85, 100, 115, 130].includes(v),
    sidebarCollapsed: (v) => typeof v === 'boolean',
    language: (v) => ['en', 'es', 'ca'].includes(v),
    devMode: (v) => typeof v === 'boolean',
    discordPresence: (v) => typeof v === 'boolean',
    hardwareAcceleration: (v) => typeof v === 'boolean',
    onGameStart: (v) => ['keep', 'minimize', 'close'].includes(v)
}

/** Només claus conegudes i amb el tipus correcte; la resta es descarta. */
function sanitizeUiPatch(patch) {
    const clean = {}
    if (patch == null || typeof patch !== 'object') return clean
    for (const [key, check] of Object.entries(UI_KEYS)) {
        if (Object.prototype.hasOwnProperty.call(patch, key) && check(patch[key])) clean[key] = patch[key]
    }
    return clean
}

module.exports = { safeFeedUrl, isPrivateHost, safeExternalUrl, isInside, safeJoin, isValidId, isValidRam, isValidOfflineName, validateJvmOptions, sanitizeUiPatch }
