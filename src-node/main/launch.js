'use strict'
// Llançament del joc (reparació, descàrrega i procés), multi-instància.
// Mòdul del procés principal d'Electron (abans tot era a index.js). Registra els seus handlers IPC en carregar-se.
const { ipcMain, assertId, ConfigManager, DistroAPI, devLog, AuthManager, javaExecFromRoot, ensureJavaDirIsRoot, FullRepair, SIGNING_KEYS, createEtaEstimator, MojangIndexProcessor, DistributionIndexProcessor, fs, DataSharing, ServersDat, Type, ProcessBuilder, app, AppLog, path, reportError, os } = require('./core')
const { targetKey, runningInstances, launchingTargets, versionOps, acquireRepairLock, broadcastInstances, instancesSnapshot } = require('./instances')
const { resolveJavaExecutable } = require('./java')
const { getVersionInstanceDir } = require('./versions')
const { writePresenceConfig, syncMenuRpc } = require('./presence')
const { prepareRelay, RuntimeManager, runtime, SessionRenew } = require('./runtime')
const { CatalogSync } = require('./wardrobe')
const { getWindow } = require('./window')



ipcMain.handle('hellmc:launch-start', async (event, target) => {
    assertId(target?.versionId)
    assertId(target?.serverId, { nullable: true })
    const sender = event.sender
    // F1: cada progrés porta el seu destí perquè la UI pugui seguir diversos llançaments alhora.
    const progressTarget = { versionId: target.versionId, serverId: target.serverId ?? null }
    const send = (progress) => { if (!sender.isDestroyed()) sender.send('hellmc:launch-progress', { ...progress, target: progressTarget }) }
    const key = targetKey(target.versionId, target.serverId)

    if (runningInstances.has(key) || launchingTargets.has(key)) {
        send({ phase: 'error', percent: 0, error: { code: 'ALREADY_RUNNING', message: 'This version is already running or launching.' } })
        return
    }
    // B5: no es pot llançar mentre la mateixa versió s'instal·la/verifica/desinstal·la.
    if (versionOps.has(target.versionId)) {
        send({ phase: 'error', percent: 0, error: { code: 'VERSION_BUSY', message: 'This version is being installed, verified or removed.' } })
        return
    }

    const account = ConfigManager.getSelectedAccount()
    if (account == null) {
        send({ phase: 'error', percent: 0, error: { code: 'NO_ACCOUNT', message: 'No account selected.' } })
        return
    }

    // Cancel·lació: `hellmc:launch-cancel` marca `cancelled`, mata el procés de reparació i rebutja `cancelledPromise`;
    // cada pas llarg es competeix amb ella (`step`) perquè el flux pari a l'instant en comptes de continuar
    // verificant/baixant i acabar obrint el joc igualment.
    const launchState = { repair: null, cancelled: false, cancel: () => {} }
    const cancelledPromise = new Promise((_, reject) => { launchState.cancel = () => reject(new Error('LAUNCH_CANCELLED')) })
    cancelledPromise.catch(() => { /* només serveix per al race de `step` */ })
    const step = (promise) => Promise.race([promise, cancelledPromise])
    const throwIfCancelled = () => { if (launchState.cancelled) throw new Error('LAUNCH_CANCELLED') }
    launchingTargets.set(key, launchState)
    let releaseRepairLock = null
    try {
        send({ phase: 'refreshing-distribution', percent: 0 })
        const distro = await step(DistroAPI.refreshDistributionOrFallback())
        const selectedVersion = distro.getVersionById(target.versionId)
        if (selectedVersion == null) {
            send({ phase: 'error', percent: 0, error: { code: 'VERSION_NOT_FOUND', message: `Version ${target.versionId} not found in distribution.` } })
            return
        }

        // Servidor recordat només si encara ofereix aquesta versió (D4/D18) — cerca sobre l'objecte
        // pla (`rawDistribution.servers`), no sobre cap mètode `getServerById` (no existeix a
        // `HeliosDistribution` de veritat, veure nota a `11-progres-fase2.md` §6).
        const rawServer = target.serverId != null
            ? distro.rawDistribution.servers?.find((s) => s.id === target.serverId)
            : null
        const server = rawServer != null && rawServer.versions.some((v) => v.id === selectedVersion.rawVersion.id)
            ? rawServer
            : null

        devLog(`launch-start target=${JSON.stringify(target)} server=${server?.id ?? null}`)

        send({ phase: 'validating-account', percent: 0 })
        const authStatus = await step(AuthManager.validateSelectedStatus())
        if (authStatus === 'invalid') {
            send({ phase: 'error', percent: 0, error: { code: 'AUTH_INVALID', message: 'Account session is no longer valid. Sign in again.' } })
            return
        }

        ConfigManager.ensureJavaConfig(selectedVersion.rawVersion.id, selectedVersion.effectiveJavaOptions, selectedVersion.rawVersion.javaOptions?.ram)
        let storedJavaExecutable = null
        try {
            storedJavaExecutable = await step(resolveJavaExecutable(selectedVersion, (phase, percent) => {
                if (launchState.cancelled || phase === 'ready') return
                send({ phase: phase === 'fetching-jdk' ? 'preparing-java' : phase, percent })
            }))
        } catch (javaErr) {
            if (launchState.cancelled) throw javaErr
            devLog('auto-java failed: ' + javaErr?.message)
            const isNetwork = /ENOTFOUND|ECONNREFUSED|ETIMEDOUT|EAI_AGAIN|fetch failed|network/i.test(String(javaErr?.code ?? '') + ' ' + String(javaErr?.message ?? ''))
            send({ phase: 'error', percent: 0, error: { code: isNetwork ? 'NEEDS_NETWORK' : 'JAVA_SETUP_FAILED', message: javaErr?.message || String(javaErr) } })
            return
        }
        if (!storedJavaExecutable) {
            send({ phase: 'error', percent: 0, error: { code: 'JAVA_NOT_CONFIGURED', message: 'No Java executable configured for this version yet.' } })
            return
        }
        // Autocuració: si el valor desat és l'arrel del JDK en comptes de l'executable (bug ja
        // arreglat a `java-detect`, però un valor dolent desat *abans* del fix es queda dolent per
        // sempre si ningú el normalitza en llegir-lo) — `ensureJavaDirIsRoot`+`javaExecFromRoot` és
        // idempotent (no fa res si `storedJavaExecutable` ja és l'executable correcte).
        const javaExecutable = javaExecFromRoot(ensureJavaDirIsRoot(storedJavaExecutable))
        if (javaExecutable !== storedJavaExecutable) {
            ConfigManager.setJavaExecutable(selectedVersion.rawVersion.id, javaExecutable)
        }
        devLog(`javaExecutable=${javaExecutable}`)
        // Mateix bug de fons que `ensureJavaConfig` (reportat per l'usuari, `Cannot read properties
        // of null (reading 'mods')`): `getModConfiguration` torna `null` fins que alguna cosa en
        // crea una entrada — a l'app antiga ho fa `syncModConfigurations` (uibinder.js) cada cop que
        // refresca la distribució, un pas que aquest flux no replica (Mods, pestanya no portada,
        // 2.3 §8). Un mapa buit és semànticament correcte per una versió mai personalitzada: cap
        // mod opcional té cap sobreescriptura, tots fan servir l'estat per defecte de la distribució.
        if (ConfigManager.getModConfiguration(selectedVersion.rawVersion.id) == null) {
            ConfigManager.setModConfiguration(selectedVersion.rawVersion.id, { id: selectedVersion.rawVersion.id, mods: {} })
        }
        ConfigManager.save()

        // B5: una sola reparació alhora (comparteixen `common/`). Si es cancel·la mentre s'espera, el pany es retorna sol.
        const lockPromise = acquireRepairLock().then((release) => {
            if (launchState.cancelled) { release(); return null }
            releaseRepairLock = release
            return release
        })
        await step(lockPromise)

        send({ phase: 'verifying-files', percent: 0 })
        const repair = new FullRepair(
            ConfigManager.getCommonDirectory(),
            ConfigManager.getInstanceDirectory(),
            ConfigManager.getLauncherDirectory(),
            selectedVersion.rawVersion.id,
            DistroAPI.isDevMode(),
            SIGNING_KEYS
        )
        launchState.repair = repair
        repair.spawnReceiver()
        await step(repair.verifyFiles((percent) => { if (!launchState.cancelled) send({ phase: 'verifying-files', percent }) }))

        send({ phase: 'downloading', percent: 0 })
        // ETA (07 §2.2): el receptor només dóna percentatges sencers, així que s'estima el temps restant amb la velocitat en %/s.
        const downloadEta = createEtaEstimator()
        downloadEta.sample(0)
        await step(repair.download((percent) => {
            if (launchState.cancelled) return
            const etaSeconds = downloadEta.sample(percent)
            send(etaSeconds != null ? { phase: 'downloading', percent, etaSeconds } : { phase: 'downloading', percent })
        }))
        repair.destroyReceiver()
        launchState.repair = null
        if (releaseRepairLock != null) { releaseRepairLock(); releaseRepairLock = null }

        throwIfCancelled()
        send({ phase: 'launching', percent: 100 })
        const mojangProcessor = new MojangIndexProcessor(ConfigManager.getCommonDirectory(), selectedVersion.rawVersion.minecraftVersion)
        const distroProcessor = new DistributionIndexProcessor(ConfigManager.getCommonDirectory(), distro, selectedVersion.rawVersion.id)
        const modLoaderData = await step(distroProcessor.loadModLoaderVersionJson(selectedVersion))
        const versionData = await step(mojangProcessor.getVersionJson())

        // D26 (06 §8.2): mateix punt on l'app antiga sincronitza `mods/` — `ProcessBuilder.build()`
        // (§93 avall) fa `fs.ensureDirSync(gameDir)` ell mateix, però cal `gameDir` ja creat *abans*
        // per poder-hi enllaçar els elements compartits, per això es garanteix aquí també (idempotent).
        const gameDir = getVersionInstanceDir(selectedVersion.rawVersion.id)
        fs.mkdirSync(gameDir, { recursive: true })
        await DataSharing.applyDataSharing(gameDir, selectedVersion.rawVersion, selectedVersion.rawVersion.id)

        // El servidor al qual es juga s'afegeix a la llista de «Multijugador» (`servers.dat`) si encara no hi és. Si la
        // versió comparteix dades, el fitxer és el mateix per a totes: en jugar a diversos servidors hi queden tots.
        // Va després de `applyDataSharing` perquè el fitxer ja sigui l'enllaç compartit. No bloqueja mai el llançament.
        const serversDatResult = ServersDat.ensureServer(gameDir, server)
        devLog(`servers.dat: ${serversDatResult.status}${serversDatResult.reason ? ` (${serversDatResult.reason})` : ''}`)

        writePresenceConfig(gameDir, distro.rawDistribution, server, selectedVersion.rawVersion)
        await step(prepareRelay(gameDir))
        void CatalogSync.sync()                       // el joc llegeix la caché de l'Armari: posa-la al dia sense endarrerir el llançament

        // Només hi pot haver els jars del runtime que la distribució declara (el runtime carrega tots els de la carpeta de mòduls).
        const runtimeFiles = selectedVersion.modules
            .filter((m) => m.rawModule.type === Type.File && m.rawModule.artifact.path?.startsWith(`${RuntimeManager.INSTANCE_FOLDER}/`))
            .map((m) => m.getPath())
        const prunedRuntime = runtime.prune(gameDir, runtimeFiles)
        if (prunedRuntime.length > 0) devLog(`runtime: esborrats ${prunedRuntime.length} jar(s) antic(s)`)

        throwIfCancelled()
        SessionRenew.clear(gameDir)                   // cap token residual d'una partida anterior: el joc no ha de poder llegir-lo en arrencar
        const pb = new ProcessBuilder(selectedVersion, versionData, modLoaderData, account, app.getVersion(), server, runtime)
        const proc = pb.build()
        const renewal = account.type === 'microsoft' && ConfigManager.getUiConfig().renewToken !== false ? SessionRenew.watch(gameDir, account.uuid) : null
        runningInstances.set(key, { id: key, versionId: target.versionId, serverId: target.serverId, startedAt: Date.now(), proc })
        broadcastInstances()
        syncMenuRpc()

        const startedAt = Date.now()
        let ended = false
        const onProcEnd = (exitCode, signal) => {
            if (ended) return
            ended = true
            if (renewal != null) renewal.stop()
            runningInstances.delete(key)
            broadcastInstances()
            syncMenuRpc()
            // B6: els fitxers compartits (servers.dat, options.txt…) que el joc ha pogut canviar tornen a l'arrel compartida.
            DataSharing.syncBack(gameDir, selectedVersion.rawVersion, selectedVersion.rawVersion.id).catch(() => { /* ja registrat */ })
            // B9: sortida anormal (no l'ha tancat l'usuari des del launcher ni amb un senyal) → s'explica amb la cua del log.
            const killedByUs = signal != null || proc.killedByUs === true
            if (exitCode != null && exitCode !== 0 && !killedByUs) {
                const details = AppLog.tailFile(proc.gameOutputPath, 25)
                const latest = AppLog.tailFile(path.join(gameDir, 'logs', 'latest.log'), 25)
                devLog(`game exited with code ${exitCode} after ${Date.now() - startedAt} ms`)
                // Plans/08 §3: fallada greu = el joc cau pocs segons despres d'arrencar (crash en carrega).
                if (Date.now() - startedAt < 60_000) {
                    reportError('game', `Game exited with code ${exitCode}`, { severe: true, name: 'GameExited', lastLog: details.length > 0 ? details : latest })
                }
                send({
                    phase: 'error',
                    percent: 0,
                    error: { code: 'GAME_EXITED', message: `Game exited with code ${exitCode}`, exitCode, details: details.length > 0 ? details : latest }
                })
            } else {
                send({ phase: 'closed', percent: 100 })
            }
        }
        proc.once('exit', onProcEnd)
        // `spawn` amb un executable inexistent/inaccessible falla de forma ASÍNCRONA (l'esdeveniment
        // 'error' del child, no una excepció síncrona) — sense escoltar-lo, l'error no passava mai
        // pel `catch` d'aquí baix i sortia com a excepció no capturada del procés principal (diàleg
        // natiu «A JavaScript error occurred», reportat per l'usuari amb un `ENOENT` de Java).
        proc.on('error', (spawnErr) => {
            devLog(`spawn error: ${spawnErr.message}`)
            ended = true
            if (renewal != null) renewal.stop()
            runningInstances.delete(key)
            broadcastInstances()
            syncMenuRpc()
            send({ phase: 'error', percent: 0, error: { code: 'SPAWN_FAILED', message: spawnErr.message } })
        })

        send({ phase: 'ready', percent: 100 })
        applyOnGameStart(key)
    } catch (err) {
        if (launchState.repair) {
            launchState.repair.destroyReceiver()
            launchState.repair = null
        }
        if (launchState.cancelled || err?.message === 'LAUNCH_CANCELLED') {
            devLog('launch-start cancel·lat per l usuari')
            return
        }
        devLog(`launch-start failed: ${err?.stack || err}`)
        // 07 §11: sense connexió i versió no instal·lada → diàleg «Cal connexió» (no un error genèric).
        const networkCodes = ['ENOTFOUND', 'EAI_AGAIN', 'ETIMEDOUT', 'ECONNREFUSED', 'ECONNRESET', 'ENETUNREACH', 'EHOSTUNREACH']
        const isNetwork = networkCodes.some((c) => err?.code === c || String(err?.message).includes(c))
        // Mòduls sense SHA-256 vàlid (hellmc-core `ArtifactHash`) o receptor de descàrregues mort (`RECEIVER_EXITED`): el missatge comença amb el codi estable, que el renderer tradueix.
        const hashCode = /^(MODULE_HASH_MISSING|MODULE_HASH_INVALID|RECEIVER_EXITED):/.exec(String(err?.message))?.[1]
        // Plans/08 §3: el Core/receptor falla abans d'iniciar (no es xarxa ni cancel·lacio).
        if (!isNetwork) reportError('game', err, { severe: true, name: hashCode ?? 'LaunchFailed' })
        send({ phase: 'error', percent: 0, error: { code: hashCode ?? (isNetwork ? 'NEEDS_NETWORK' : 'LAUNCH_FAILED'), message: err?.message || String(err) } })
    } finally {
        if (releaseRepairLock != null) { releaseRepairLock(); releaseRepairLock = null }
        // Només si la clau encara és d'aquest llançament: després d'un cancel·lar, l'usuari pot haver-ne començat un de nou.
        if (launchingTargets.get(key) === launchState) launchingTargets.delete(key)
    }
})

// D13: què fa el launcher quan el joc ja està en marxa (Configuració > Launcher > «En iniciar el joc»).
// 'close' només si el joc és independent del launcher (`launchDetached`) i no hi ha cap altre llançament en curs; es tanca
// al cap de 10 s i només si la instància segueix viva (si el joc petés de seguida, el jugador ha de veure l'error).
function applyOnGameStart(key) {
    const mode = ConfigManager.getUiConfig().onGameStart
    if (mode === 'minimize' || mode === 'close') {
        if (getWindow() != null && !getWindow().isDestroyed()) getWindow().minimize()
    }
    if (mode === 'close' && ConfigManager.getLaunchDetached()) {
        setTimeout(() => {
            const othersLaunching = [...launchingTargets.keys()].some((k) => k !== key)
            if (runningInstances.has(key) && !othersLaunching) app.quit()
        }, 10000)
    }
}

ipcMain.handle('hellmc:launch-cancel', (_event, target) => {
    assertId(target?.versionId)
    assertId(target?.serverId, { nullable: true })
    const key = targetKey(target.versionId, target.serverId)
    const state = launchingTargets.get(key)
    if (state == null) return
    state.cancelled = true
    state.cancel()
    if (state.repair) {
        state.repair.destroyReceiver()
        state.repair = null
    }
    launchingTargets.delete(key)
})

// ── 2.11: instàncies en execució (llistar + tancar per la força) ─────────────────────────────
ipcMain.handle('hellmc:instances-list', () => instancesSnapshot())
ipcMain.handle('hellmc:instances-kill', (_event, id) => {
    if (typeof id !== 'string') return
    const instance = runningInstances.get(id)
    if (instance) {
        instance.proc.killedByUs = true
        instance.proc.kill()
    }
})

// B3: carpetes temporals de natives que es van quedar si el launcher es va tancar abans que el joc. Només les de > 2 dies,
// perquè un joc obert d'una sessió anterior (launchDetached) encara pot estar-les fent servir.
function cleanStaleNatives() {
    for (const folder of [ConfigManager.getTempNativeFolder(), 'WCNatives']) cleanStaleNativesIn(path.join(os.tmpdir(), folder))
}
function cleanStaleNativesIn(base) {
    fs.promises.readdir(base).then(async (names) => {
        const limit = Date.now() - 2 * 24 * 60 * 60 * 1000
        for (const name of names) {
            const dir = path.join(base, name)
            try {
                if ((await fs.promises.stat(dir)).mtimeMs < limit) await fs.promises.rm(dir, { recursive: true, force: true })
            } catch { /* en ús o ja esborrada */ }
        }
    }).catch(() => { /* no existeix la carpeta: res a netejar */ })
}

module.exports = {
    cleanStaleNatives
}
