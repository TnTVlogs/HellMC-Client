'use strict'
// Estat compartit de les instàncies de Minecraft en execució i de les operacions sobre versions (el fan servir llançament, versions, Discord i sistema).
// Mòdul del procés principal d'Electron (abans tot era a index.js). Registra els seus handlers IPC en carregar-se.
const { getWindow } = require('./window')



// ── 2.1/2.11: llançament real (repair/descàrrega/procés), multi-instància de veritat ──────────
// Seqüència de llançament (`game.createRepair` +
// `verifyFiles`/`downloadFiles` + `prepareAndLaunch`), mai reimplementada — només reportada com a
// `LaunchProgress` (06 §5) en comptes de callbacks separats per fase. **Fora d'abast d'aquesta
// sessió**: detecció/instal·lació automàtica de Java (`asyncSystemScan`/`JavaGuard` a l'app
// antiga) — si no hi ha executable configurat, es reporta com a error en comptes d'intentar
// resoldre'l; Discord RPC i el parsing de log per regex (`GAME_JOINED_REGEX` etc.) tampoc es
// repliquen aquí, són polish de la Fase 2.1 posterior, no calen per tenir un «Jugar» real.
//
// Petició de l'usuari (2026-09-29): permetre jugar diverses versions alhora de debò (no un simple
// bloqueig global) + un lloc visible per veure quines instàncies hi ha obertes i forçar-ne el
// tancament — el motiu real: el botó Jugar torna a l'estat inicial en rebre `phase:'ready'` (el
// `spawn` ja ha tornat), però la finestra de Minecraft pot trigar uns segons més a aparèixer de
// veritat; sense cap indicador visible, l'usuari pensava que no havia fet res i tornava a prémer
// Jugar, obrint una segona instància de la mateixa versió sense voler.
//
// Disseny: `runningInstances` (clau = `versionId::serverId`, un procés spawnejat per clau) +
// `launchingTargets` (mateixa clau, mentre encara s'està verificant/descarregant, abans d'arribar a
// `spawn`) — **totes dues es comproven** abans d'acceptar un `launch-start` nou per a la mateixa
// clau, així es bloqueja el doble clic tant si el segon intent arriba durant la baixada com un cop
// ja engegat. Versions/servidors *diferents* no es bloquegen entre si (multi-instància real,
// decidit amb l'usuari).
const runningInstances = new Map() // key -> { id, versionId, serverId, startedAt, proc }
const launchingTargets = new Map() // key -> { repair: FullRepair | null }

function targetKey(versionId, serverId) {
    return `${versionId}::${serverId ?? ''}`
}

// B5: exclusió d'operacions de disc sobre les versions.
//  · `versionOps`: versions amb una instal·lació/verificació/desinstal·lació en curs (impedeixen jugar-hi).
//  · `repairChain`: les reparacions (`FullRepair`) comparteixen `common/` (biblioteques, assets): s'executen d'una en una,
//    ja sigui des de «Jugar» o des d'«Instal·lar»/«Actualitzar-ho tot».
const versionOps = new Map() // versionId -> 'install' | 'verify' | 'uninstall'
let repairChain = Promise.resolve()
function acquireRepairLock() {
    let release
    const previous = repairChain
    repairChain = new Promise((resolve) => { release = resolve })
    return previous.then(() => release)
}
function isVersionRunning(versionId) {
    for (const instance of runningInstances.values()) {
        if (instance.versionId === versionId) return true
    }
    for (const key of launchingTargets.keys()) {
        if (key.startsWith(`${versionId}::`)) return true
    }
    return false
}
/** Marca una operació sobre `versionId`; llança `VERSION_BUSY`/`VERSION_RUNNING` si no és possible. Retorna l'alliberament. */
function beginVersionOp(versionId, kind) {
    if (versionOps.has(versionId)) throw new Error('VERSION_BUSY')
    if (isVersionRunning(versionId)) throw new Error('VERSION_RUNNING')
    versionOps.set(versionId, kind)
    return () => versionOps.delete(versionId)
}
function instancesSnapshot() {
    return [...runningInstances.values()].map(({ id, versionId, serverId, startedAt }) => ({ id, versionId, serverId, startedAt }))
}
function broadcastInstances() {
    if (getWindow() != null && !getWindow().isDestroyed()) {
        getWindow().webContents.send('hellmc:instances-changed', instancesSnapshot())
    }
}

module.exports = {
    acquireRepairLock,
    beginVersionOp,
    broadcastInstances,
    instancesSnapshot,
    launchingTargets,
    runningInstances,
    targetKey,
    versionOps
}
