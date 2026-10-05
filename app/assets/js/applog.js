'use strict'
// O2: log persistent del procés principal (abans tot anava a una consola que a l'app empaquetada ningú no veu).
//
// Captura `process.stdout`/`process.stderr` (és per on escriu `LoggerUtil`/winston i `console.*`), treu els colors ANSI,
// **redacta credencials** i ho afegeix a `<userData>/logs/launcher.log` amb rotació (2 MB, 3 fitxers).

const fs = require('fs')
const path = require('path')

const MAX_BYTES = 2 * 1024 * 1024
const KEEP = 3

// Ordre important: primer els patrons més específics.
const REDACTIONS = [
    // `--accessToken <token>` (en línia o com a element següent d'un array imprès per `util.inspect`)
    [/(--accessToken['"]?,?\s+['"]?)[^\s'",\]]+/gi, '$1[REDACTED]'],
    [/(--uuid['"]?,?\s+['"]?)[^\s'",\]]+/gi, '$1[REDACTED]'],
    // JSON/objectes amb tokens
    [/((?:access_token|refresh_token|accessToken|id_token)['"]?\s*[:=]\s*['"]?)[^\s'",}\]]+/gi, '$1[REDACTED]'],
    // JWT i `Bearer`
    [/Bearer\s+[A-Za-z0-9._~+/=-]+/g, 'Bearer [REDACTED]'],
    [/eyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}/g, '[REDACTED-JWT]']
]

// eslint-disable-next-line no-control-regex
const ANSI = /\u001b\[[0-9;]*m/g

function redact(text) {
    let out = String(text)
    for (const [re, replacement] of REDACTIONS) out = out.replace(re, replacement)
    return out
}

let logFile = null
let installed = false

function rotateIfNeeded() {
    try {
        if (fs.statSync(logFile).size < MAX_BYTES) return
    } catch {
        return
    }
    for (let i = KEEP - 1; i >= 1; i--) {
        const from = i === 1 ? logFile : `${logFile}.${i - 1}`
        const to = `${logFile}.${i}`
        try { if (fs.existsSync(from)) fs.renameSync(from, to) } catch { /* ignora */ }
    }
}

function append(chunk) {
    if (logFile == null) return
    try {
        rotateIfNeeded()
        fs.appendFileSync(logFile, redact(String(chunk).replace(ANSI, '')))
    } catch {
        // el log mai ha de poder fer petar l'app
    }
}

/** Instal·la la captura. `logsDir` = carpeta (es crea). Idempotent. */
function install(logsDir) {
    if (installed) return
    installed = true
    fs.mkdirSync(logsDir, { recursive: true })
    logFile = path.join(logsDir, 'launcher.log')
    append(`\n===== ${new Date().toISOString()} · inici =====\n`)
    for (const stream of [process.stdout, process.stderr]) {
        const original = stream.write.bind(stream)
        stream.write = (chunk, ...rest) => {
            append(chunk)
            return original(chunk, ...rest)
        }
    }
}

function getLogFile() {
    return logFile
}

/** Últimes `lines` línies d'un fitxer de text gran (només llegeix el final), ja redactades. */
function tailFile(file, lines = 40, maxBytes = 16 * 1024) {
    try {
        const { size } = fs.statSync(file)
        const length = Math.min(size, maxBytes)
        const fd = fs.openSync(file, 'r')
        try {
            const buffer = Buffer.alloc(length)
            fs.readSync(fd, buffer, 0, length, size - length)
            return redact(buffer.toString('utf8').replace(ANSI, '')).split(/\r?\n/).filter(Boolean).slice(-lines)
        } finally {
            fs.closeSync(fd)
        }
    } catch {
        return []
    }
}

module.exports = { install, getLogFile, redact, tailFile }
