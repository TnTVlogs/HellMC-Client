'use strict'

// B23/S10: llançament del receptor de descàrregues (`hellmc-core`) amb `utilityProcess` d'Electron en lloc de
// `child_process.fork` sobre el binari d'Electron. Així el *fuse* `RunAsNode` es pot desactivar.
// `hellmc-core` és agnòstic d'Electron: aquest mòdul li injecta l'estratègia (`FullRepair.setDefaultSpawner`).
// Pla: docs/pendents/plans/02-runasnode-i-c13.md (A2). Prototip manual: docs/pendents/plans/progress-02-runasnode.md.

// Llista blanca (comparació en majúscules: a Windows els noms no distingeixen majúscules).
const ALLOWED_ENV = new Set([
    // sistema / rutes
    'PATH', 'PATHEXT', 'SYSTEMROOT', 'WINDIR', 'COMSPEC', 'TEMP', 'TMP', 'TMPDIR', 'HOME', 'HOMEDRIVE', 'HOMEPATH',
    'USERPROFILE', 'USERNAME', 'USERDOMAIN', 'APPDATA', 'LOCALAPPDATA', 'PROGRAMDATA', 'PROGRAMFILES', 'PROGRAMFILES(X86)',
    'PROGRAMW6432', 'COMMONPROGRAMFILES', 'OS', 'PROCESSOR_ARCHITECTURE', 'NUMBER_OF_PROCESSORS',
    // llengua i hora
    'LANG', 'LC_ALL', 'TZ',
    // xarxa: proxies i certificats (per a `got`)
    'HTTP_PROXY', 'HTTPS_PROXY', 'NO_PROXY', 'NODE_EXTRA_CA_CERTS', 'SSL_CERT_FILE', 'SSL_CERT_DIR',
    // diagnòstic propi
    'NODE_ENV', 'HELLMC_DEBUG'
])

// Mai entren, ni per la llista blanca ni com a variables addicionals explícites.
function isForbidden(name) {
    const n = name.toUpperCase()
    return n === 'ELECTRON_RUN_AS_NODE' || n.startsWith('ELECTRON_') || n === 'NODE_OPTIONS' || n === 'NODE_PATH' ||
        n === 'DEBUG' || n === 'GH_TOKEN' || n === 'GITHUB_TOKEN' ||
        n.endsWith('_TOKEN') || n.endsWith('_KEY') || n.endsWith('_SECRET') || n.endsWith('_PASSWORD')
}

/**
 * Entorn mínim del fill: només la llista blanca de `processEnv` + `extra` (sense valors no-string ni claus prohibides).
 * Funció pura: no llegeix `process.env`.
 */
function buildReceiverEnv(processEnv, extra) {
    const env = {}
    for (const [name, value] of Object.entries(processEnv ?? {})) {
        if (typeof value !== 'string') continue
        if (isForbidden(name)) continue
        if (ALLOWED_ENV.has(name.toUpperCase())) env[name] = value
    }
    for (const [name, value] of Object.entries(extra ?? {})) {
        if (value == null || isForbidden(name)) continue
        env[name] = String(value)
    }
    return env
}

/**
 * Crea un `ReceiverSpawner` (interfície de `hellmc-core`) sobre `utilityProcess.fork`.
 * @param {{ fork: Function }} utilityProcess  `utilityProcess` d'Electron (injectat: les proves hi posen un fals).
 * @param {() => NodeJS.ProcessEnv} [getProcessEnv]
 */
function createUtilityProcessSpawner(utilityProcess, getProcessEnv = () => process.env) {
    return {
        spawn(modulePath, receiverName, extraEnv) {
            // `args` arriben al fill (l'índex a `process.argv` s'ha de verificar al prototip F0); el nom viatja també per `init`.
            const child = utilityProcess.fork(modulePath, [receiverName], {
                env: buildReceiverEnv(getProcessEnv(), extraEnv),
                stdio: 'pipe',
                serviceName: 'HellMC download receiver'
            })
            let exited = false
            const exitCbs = []
            child.on('exit', (code) => {
                if (exited) return
                exited = true
                for (const cb of exitCbs) cb(code ?? null)
            })
            const splitLines = (data) => String(data).split(/\r?\n/).map((l) => l.trimEnd()).filter((l) => l.length > 0)
            return {
                postMessage: (msg) => { if (!exited) child.postMessage(msg) },
                onMessage: (cb) => { child.on('message', cb) },
                onExit: (cb) => { exitCbs.push(cb) },
                onLog: (cb) => {
                    child.stdout?.on('data', (d) => splitLines(d).forEach((l) => cb('out', l)))
                    child.stderr?.on('data', (d) => splitLines(d).forEach((l) => cb('err', l)))
                },
                kill: () => {
                    try { if (!exited) child.kill() } catch { /* ja mort */ }
                },
                get alive() { return !exited }
            }
        }
    }
}

/** Injecta el spawner a `FullRepair`. Es crida un cop; `utilityProcess.fork` només es crida quan l'app és llesta (en llançar). */
function installReceiverSpawner(FullRepair, utilityProcess) {
    FullRepair.setDefaultSpawner(createUtilityProcessSpawner(utilityProcess))
}

module.exports = { buildReceiverEnv, createUtilityProcessSpawner, installReceiverSpawner, ALLOWED_ENV }
