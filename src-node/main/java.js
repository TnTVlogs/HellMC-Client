'use strict'
// Java i RAM per versió.
// Mòdul del procés principal d'Electron (abans tot era a index.js). Registra els seus handlers IPC en carregar-se.
const { DistroAPI, ConfigManager, ipcMain, assertId, devLog, isJavaExecPath, fs, Security, javaExecFromRoot, ensureJavaDirIsRoot, validateSelectedJvm, discoverBestJvmInstallation, BrowserWindow, dialog, getValidatableJavaPaths, resolveJvmSettings, filterApplicableJavaPaths, rankApplicableJvms, path, latestOpenJDK, downloadFile, validateLocalFile, extractJdk } = require('./core')



// ── 2.3: Java i RAM per versió (`config.getVersion`/`setVersion`, `java.detect`/`pick`) ────────
// Cal `ensureJavaConfig` (idempotent, `configmanager.js:614-618`) abans de llegir/escriure res de
// `javaConfig[versionId]` la primera vegada — sense això `getMinRAM`/etc peten (accedeixen a
// `config.javaConfig[versionid].X` directament, sense comprovar que existeixi l'entrada). Bug real
// d'aquesta sessió: es va escriure aquest comentari i la funció, però es va oblidar cridar-la des
// de `config-get-version`/`config-set-version` — només `java-detect` la feia servir. Reportat per
// l'usuari: `TypeError: Cannot read properties of undefined (reading 'minRAM')` en obrir la
// pestanya Java i memòria (i, en conseqüència, `JAVA_NOT_CONFIGURED` en prémer Jugar, perquè mai
// s'arribava a desar cap executable).
async function ensureJavaConfigForVersion(versionId) {
    const distro = await DistroAPI.getDistribution()
    const selectedVersion = distro.getVersionById(versionId)
    if (selectedVersion == null) return null
    ConfigManager.ensureJavaConfig(versionId, selectedVersion.effectiveJavaOptions, selectedVersion.rawVersion.javaOptions?.ram)
    return selectedVersion
}
ipcMain.handle('hellmc:config-get-version', async (_event, versionId) => {
    assertId(versionId)
    if ((await ensureJavaConfigForVersion(versionId)) == null) throw new Error('VERSION_NOT_FOUND')
    return {
        minRAM: ConfigManager.getMinRAM(versionId),
        maxRAM: ConfigManager.getMaxRAM(versionId),
        executable: ConfigManager.getJavaExecutable(versionId),
        jvmOptions: ConfigManager.getJVMOptions(versionId),
        forceExecutable: ConfigManager.getJavaForced(versionId)
    }
})
ipcMain.handle('hellmc:config-set-version', async (_event, versionId, patch) => {
    assertId(versionId)
    if ((await ensureJavaConfigForVersion(versionId)) == null) throw new Error('VERSION_NOT_FOUND')
    if (patch == null || typeof patch !== 'object') throw new Error('INVALID_VALUE')
    devLog(`config-set-version ${versionId} patch=${JSON.stringify(patch)}`)
    // B11: només valors de memòria vàlids per a la JVM (`512M`, `4G`); mai text lliure dins `-Xmx`/`-Xms`.
    const ramRe = /^[1-9]\d{0,5}[MG]$/
    if (patch.minRAM != null && ramRe.test(patch.minRAM)) ConfigManager.setMinRAM(versionId, patch.minRAM)
    if (patch.maxRAM != null && ramRe.test(patch.maxRAM)) ConfigManager.setMaxRAM(versionId, patch.maxRAM)
    // S4: l'executable ha de ser un fitxer de Java existent; les opcions de JVM que carreguen codi només amb el mode desenvolupador.
    if (patch.executable != null) {
        if (typeof patch.executable !== 'string' || !isJavaExecPath(patch.executable) || !fs.existsSync(patch.executable)) throw new Error('INVALID_JAVA_EXECUTABLE')
        ConfigManager.setJavaExecutable(versionId, patch.executable)
    }
    if (typeof patch.forceExecutable === 'boolean') ConfigManager.setJavaForced(versionId, patch.forceExecutable)
    if (patch.jvmOptions != null) {
        const checked = Security.validateJvmOptions(patch.jvmOptions, ConfigManager.getUiConfig()?.devMode === true)
        if (!checked.ok) throw new Error(`INVALID_JVM_OPTIONS:${checked.reason}`)
        ConfigManager.setJVMOptions(versionId, checked.options)
    }
    ConfigManager.save()
})
ipcMain.handle('hellmc:java-detect', async (_event, versionId) => {
    const selectedVersion = await ensureJavaConfigForVersion(versionId)
    if (selectedVersion == null) return { available: false }
    const semverRange = selectedVersion.effectiveJavaOptions.supported
    devLog(`java-detect ${versionId} semverRange=${semverRange}`)
    const existing = ConfigManager.getJavaExecutable(versionId)
    if (existing) {
        // `validateSelectedJvm` valida igual de bé l'arrel que l'executable (crida
        // `getHotSpotSettings` internament, que deu normalitzar-ho ell sol) — **no es pot fer
        // servir el seu veredicte per decidir si `existing` ja té la forma correcta**. Bug real
        // reportat per l'usuari: com que un cop es va desar l'arrel (per l'altre bug, ja arreglat
        // més amunt), `validateSelectedJvm(arrel, ...)` seguia tornant "vàlid" per sempre —
        // `java-detect` no es curava mai sol, calia normalitzar `existing` abans de confiar-hi,
        // exactament igual que `found.path` uns quants línies més avall.
        const normalizedExisting = javaExecFromRoot(ensureJavaDirIsRoot(existing))
        const valid = await validateSelectedJvm(normalizedExisting, semverRange)
        devLog(`existing=${existing} normalized=${normalizedExisting} valid=${JSON.stringify(valid)}`)
        if (valid != null) {
            if (normalizedExisting !== existing) {
                ConfigManager.setJavaExecutable(versionId, normalizedExisting)
                ConfigManager.save()
            }
            return { available: true, path: normalizedExisting, version: valid.semverStr }
        }
    }
    if (existing && ConfigManager.getJavaForced(versionId) && fs.existsSync(javaExecFromRoot(ensureJavaDirIsRoot(existing)))) {
        return { available: true, path: javaExecFromRoot(ensureJavaDirIsRoot(existing)), version: undefined }
    }
    const found = await discoverBestJvmInstallation(ConfigManager.getDataDirectory(), semverRange)
    devLog(`discoverBestJvmInstallation -> ${JSON.stringify(found)}`)
    if (found == null) return { available: false }
    // `found.path` és l'arrel de la instal·lació JDK, no l'executable — mateixa conversió que
    // `landing.js:292` (`JavaUtils.javaExecFromRoot(jvmDetails.path)`) abans de desar-lo.
    const executable = javaExecFromRoot(found.path)
    ConfigManager.setJavaExecutable(versionId, executable)
    ConfigManager.setJavaForced(versionId, false)
    ConfigManager.save()
    return { available: true, path: executable, version: found.semverStr }
})
ipcMain.handle('hellmc:java-pick', async (event) => {
    const senderWin = BrowserWindow.fromWebContents(event.sender)
    const result = await dialog.showOpenDialog(senderWin, {
        properties: ['openFile'],
        filters: process.platform === 'win32' ? [{ name: 'Java', extensions: ['exe'] }] : undefined
    })
    if (result.canceled || result.filePaths.length === 0) return null
    let picked = result.filePaths[0]
    if (!isJavaExecPath(picked)) {
        picked = javaExecFromRoot(ensureJavaDirIsRoot(picked))
    }
    return fs.existsSync(picked) ? picked : null
})

// 2.5 (Configuració > Java, «versions de Java detectades» + «ruta personalitzada global»): no
// toca cap configuració per versió (`javaConfig[versionId]`) — `getGlobalJavaExecutable`/
// `setGlobalJavaExecutable` només serveixen de llavor per a versions **noves** (`defaultJavaConfig*`,
// `configmanager.js`); una versió ja configurada no es veu afectada en canviar-ho.
ipcMain.handle('hellmc:java-list-installations', async () => {
    const dataDir = ConfigManager.getDataDirectory()
    const paths = await getValidatableJavaPaths(dataDir)
    const resolved = await resolveJvmSettings(paths)
    // `>=8` (sense límit superior): aquí es vol mostrar **tot** el que hi ha instal·lat, no filtrar
    // per la versió de Minecraft d'una versió concreta (que és el que fa `java-detect`).
    const details = filterApplicableJavaPaths(resolved, '>=8')
    rankApplicableJvms(details)
    // Dedup: el mateix JDK arriba per rutes diferents (`\Program Files\...` sense lletra de unitat i
    // `C:\Program Files\...`, registre + carpetes conegudes). `path.resolve` hi afegeix la unitat;
    // `realpath` resol enllaços; Windows/macOS no distingeixen majúscules.
    const seen = new Set()
    const unique = []
    for (const d of details) {
        let key = path.resolve(d.path)
        try { key = fs.realpathSync.native(key) } catch { /* ruta inexistent: es queda el resolt */ }
        if (process.platform !== 'linux') key = key.toLowerCase()
        if (seen.has(key)) continue
        seen.add(key)
        unique.push(d)
    }
    return unique.map((d) => ({ path: path.resolve(d.path), version: d.semverStr, vendor: d.vendor }))
})
ipcMain.handle('hellmc:java-global-get', () => ConfigManager.getGlobalJavaExecutable())
ipcMain.handle('hellmc:java-global-set', (_event, executable) => {
    if (executable != null && (typeof executable !== 'string' || !isJavaExecPath(executable) || !fs.existsSync(executable))) throw new Error('INVALID_JAVA_EXECUTABLE')
    ConfigManager.setGlobalJavaExecutable(executable)
    ConfigManager.save()
})

// 2.3: baixada automàtica de JDK quan `java-detect` no en troba cap de compatible (l'únic tros de
// 2.3 que quedava «pendent confirmat, no oblidat» a `11-progres-fase2.md` §Estat global). Mateixa
// lògica que `landing.js:downloadJava` (app antiga), mai reimplementada: `latestOpenJDK` tria
// l'asset (Temurin/Corretto segons plataforma, resolt per `effectiveJavaOptions.distribution`),
// `downloadFile` (mateix `hellmc-core/dl` que `FullRepair`) el baixa, `extractJdk` el descomprimeix
// i ja retorna l'**executable** (no l'arrel — a diferència de `discoverBestJvmInstallation`, no cal
// `javaExecFromRoot` aquí, `JavaGuard.js:extractJdk` ja hi passa per dins).
// Baixa i descomprimeix el JDK adequat per a una versió i el desa com a executable seu. Compartit entre
// `hellmc:java-download` (botó a Configuració) i el flux de Jugar (`resolveJavaExecutable`).
// `report(phase, percent)`: 'fetching-jdk' | 'downloading-java' | 'extracting-java' | 'ready'.
async function downloadJdkForVersion(versionId, selectedVersion, report) {
    const { suggestedMajor, supported: semverRange, distribution: jdkDistribution } = selectedVersion.effectiveJavaOptions
    devLog(`java-download ${versionId} suggestedMajor=${suggestedMajor} distribution=${jdkDistribution}`)

    report('fetching-jdk', 0)
    const asset = await latestOpenJDK(suggestedMajor, ConfigManager.getDataDirectory(), jdkDistribution)
    if (asset == null) {
        throw new Error('JDK_FETCH_FAILED')
    }

    report('downloading-java', 0)
    await downloadFile(asset.url, asset.path, (progress) => {
        report('downloading-java', Math.trunc((progress.percent ?? 0) * 100))
    })
    report('downloading-java', 100)

    // `hash` és opcional als `Asset` no rastrejats (`dl/Asset.d.ts`) — aquí sempre hi és (ve
    // d'Adoptium/Corretto), però es comprova igualment per no assumir-ho a cegues.
    if (asset.hash != null && !(await validateLocalFile(asset.path, asset.algo, asset.hash))) {
        devLog(`java-download corrupted: ${asset.path}`)
        throw new Error('JAVA_DOWNLOAD_CORRUPTED')
    }

    report('extracting-java', 0)
    const newJavaExec = await extractJdk(asset.path)
    devLog(`java-download extracted -> ${newJavaExec}`)

    ConfigManager.setJavaExecutable(versionId, newJavaExec)
    ConfigManager.setJavaForced(versionId, false)
    ConfigManager.save()

    const info = await validateSelectedJvm(newJavaExec, semverRange)
    report('ready', 100)
    return { available: true, path: newJavaExec, version: info?.semverStr }
}

ipcMain.handle('hellmc:java-download', async (event, versionId) => {
    const selectedVersion = await ensureJavaConfigForVersion(versionId)
    if (selectedVersion == null) {
        throw new Error(`Version ${versionId} not found in distribution.`)
    }
    const sender = event.sender
    return downloadJdkForVersion(versionId, selectedVersion, (phase, percent) => {
        if (!sender.isDestroyed()) sender.send('hellmc:java-download-progress', versionId, { phase, percent })
    })
})

// Proveïdors de JDK de `javaOptions.distribution` → text del `vendor` que informa el JDK instal·lat.
const JDK_VENDOR_PATTERNS = { TEMURIN: /adoptium|temurin|eclipse/i, CORRETTO: /amazon|corretto/i }

/**
 * Jugar sense Java configurat (o amb un de no vàlid): es resol sol, sense preguntar.
 *   1. El Java ja desat per a la versió, si és vàlid per al rang de la versió.
 *   2. Un JDK instal·lat al PC que compleixi el rang. Si la versió **exigeix** un proveïdor
 *      (`javaOptions.distribution` explícit), només val un d'aquest proveïdor.
 *   3. Si no n'hi ha cap, es baixa el que indica la versió (proveïdor i versió major).
 * Retorna l'executable (ja desat a la config) o llança si no s'ha pogut obtenir.
 */
async function resolveJavaExecutable(selectedVersion, report) {
    const versionId = selectedVersion.rawVersion.id
    const semverRange = selectedVersion.effectiveJavaOptions.supported

    const stored = ConfigManager.getJavaExecutable(versionId)
    // B13: un Java triat a mà (forçat) es respecta encara que no compleixi el rang de la versió, mentre existeixi.
    if (stored && ConfigManager.getJavaForced(versionId) && fs.existsSync(javaExecFromRoot(ensureJavaDirIsRoot(stored)))) {
        return javaExecFromRoot(ensureJavaDirIsRoot(stored))
    }
    if (stored) {
        const normalized = javaExecFromRoot(ensureJavaDirIsRoot(stored))
        if ((await validateSelectedJvm(normalized, semverRange)) != null) return normalized
    }

    const requiredVendor = selectedVersion.rawVersion.javaOptions?.distribution
    const vendorPattern = requiredVendor != null ? JDK_VENDOR_PATTERNS[requiredVendor] : null
    report('fetching-jdk', 0)
    const paths = await getValidatableJavaPaths(ConfigManager.getDataDirectory())
    const details = filterApplicableJavaPaths(await resolveJvmSettings(paths), semverRange)
    rankApplicableJvms(details)
    const found = details.find((d) => vendorPattern == null || vendorPattern.test(d.vendor ?? ''))
    if (found != null) {
        const executable = javaExecFromRoot(found.path)
        devLog(`auto-java ${versionId}: instal·lat ${executable} (${found.vendor} ${found.semverStr})`)
        ConfigManager.setJavaExecutable(versionId, executable)
        ConfigManager.save()
        return executable
    }

    devLog(`auto-java ${versionId}: cap JDK compatible instal·lat (proveïdor ${requiredVendor ?? 'qualsevol'}), es baixa`)
    const downloaded = await downloadJdkForVersion(versionId, selectedVersion, report)
    return downloaded.path
}

module.exports = {
    resolveJavaExecutable
}
