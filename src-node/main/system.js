'use strict'
// Sistema: obrir camins/enllaços, memòria, esborrat de dades locals, diagnòstic, estat de Minecraft i configuració del joc.
// Mòdul del procés principal d'Electron (abans tot era a index.js). Registra els seus handlers IPC en carregar-se.
const { ipcMain, Security, ConfigManager, app, shell, openExternalSafely, isDev, path, Telemetry, ErrorReports, fs, os, AppLog, semver, resolveLanguage, BrowserWindow, dialog } = require('./core')
const { runningInstances } = require('./instances')
const { syncMenuRpc } = require('./presence')
const { ROOT } = require('./core')


ipcMain.handle('hellmc:open-path', (_event, p) => {
    if (typeof p !== 'string' || !(Security.isInside(ConfigManager.getDataDirectory(), p) || Security.isInside(app.getPath('userData'), p))) {
        console.warn('[main] blocked open-path', String(p).slice(0, 200))
        return ''
    }
    return shell.openPath(p)
})
ipcMain.handle('hellmc:open-external', (_event, url) => openExternalSafely(url))
// 2.5 (Sobre > «Llicències de tercers», D23): `THIRD_PARTY_LICENSES.txt` viu a l'arrel del repo en
// dev i a `extraResources` (`electron-builder.yml`) en un paquet real — mai dins l'asar.
// `LICENSE-LGPL-3.0.txt`: text de la llicència de `HellMC-Core` (02 §3/§7.2).
function openBundledFile(name) {
    const file = isDev ? path.join(ROOT, name) : path.join(process.resourcesPath, name)
    return shell.openPath(file)
}
ipcMain.handle('hellmc:open-third-party-licenses', () => openBundledFile('THIRD_PARTY_LICENSES.txt'))
ipcMain.handle('hellmc:open-lgpl-license', () => openBundledFile('LICENSE-LGPL-3.0.txt'))

// D16: «Tanca la sessió i esborra les dades»: comptes i tokens, acceptació legal, cache i logs. No toca les dades del joc
// (mons, versions instal·lades): són grans i del jugador. Reinicia el launcher.
ipcMain.handle('hellmc:wipe-local-data', async () => {
    if (runningInstances.size > 0) throw new Error('GAME_RUNNING')
    ConfigManager.removeAllAccounts()
    await Telemetry.disable() // demana al servidor que esborri el rastre i descarta l'identificador local
    ConfigManager.setLegal({ termsAcceptedVersion: null, acceptedAt: null, telemetryOptIn: false, errorReportOptIn: false, crashPromptDisabled: false, crashPromptAt: null })
    ErrorReports.clear()
    ConfigManager.save()
    const userData = app.getPath('userData')
    for (const name of ['distribution.json', 'distribution.json.sig', 'newscache.json', 'config.json.bak', 'config.json.bak-v1']) {
        await fs.promises.rm(path.join(userData, name), { force: true }).catch(() => { /* ja no hi és */ })
    }
    const logsDir = path.join(userData, 'logs')
    for (const name of await fs.promises.readdir(logsDir).catch(() => [])) {
        const file = path.join(logsDir, name)
        // El log actual està obert per escriure: es buida; els rotats s'esborren.
        if (name === 'launcher.log') await fs.promises.writeFile(file, '').catch(() => { /* ignora */ })
        else await fs.promises.rm(file, { force: true }).catch(() => { /* ignora */ })
    }
    app.relaunch()
    app.exit(0)
})
ipcMain.handle('hellmc:open-logs', () => shell.openPath(path.join(app.getPath('userData'), 'logs')))
ipcMain.handle('hellmc:diagnostic-report', () => {
    const selected = ConfigManager.getSelectedVersion()
    const lines = [
        `HellMC Client ${app.getVersion()}${app.isPackaged ? '' : ' (dev)'}`,
        `OS: ${process.platform} ${process.arch} ${os.release()}`,
        `Electron ${process.versions.electron} · Chrome ${process.versions.chrome} · Node ${process.versions.node}`,
        `RAM: ${Math.round(os.freemem() / 1048576)} MB free of ${Math.round(os.totalmem() / 1048576)} MB`,
        `Selected version: ${selected ?? '—'}`,
        `Running instances: ${runningInstances.size}`,
        '',
        '--- launcher.log (last 80 lines) ---',
        ...AppLog.tailFile(AppLog.getLogFile(), 80, 64 * 1024)
    ]
    return lines.join('\n')
})
// `process.env.npm_package_version` (l'antic valor del mock a `preload.js`) només existeix quan
// el procés principal s'ha arrencat via `npm run …` — en un paquet real (producció) mai hi és,
// Sobre mostraria sempre «0.0.0-dev». Síncron (`event.returnValue`) perquè `api.ts` declara
// `system.appVersion` com a valor pla, no una promesa — es demana un sol cop en carregar el
// preload, igual que `process.platform`.
ipcMain.on('hellmc:system-app-version', (event) => {
    event.returnValue = app.getVersion()
})
// 07 §2.4: la distribució exigeix una versió mínima de client (`minClientVersion`) → pantalla de
// bloqueig «Actualitza el client». Només en un paquet real: en desenvolupament (`app.isPackaged` fals)
// la versió del `package.json` no és una versió publicada i bloquejaria el desenvolupador.
ipcMain.handle('hellmc:system-client-outdated', (_event, minClientVersion) => {
    if (!app.isPackaged || typeof minClientVersion !== 'string' || semver.valid(minClientVersion) == null) return false
    // Les versions preliminars (2.0.0-beta.N) compten com la seva versió base: si no, `semver.lt('2.0.0-beta.1', '2.0.0')`
    // és cert i el canal beta quedaria sempre bloquejat.
    const current = semver.coerce(app.getVersion())
    return current != null && semver.lt(current, minClientVersion)
})

// 07 §1.1 «Estat de Mojang»: l'API pública antiga (`status.mojang.com`) està tancada i no n'hi ha cap
// substitut oficial; es mesura l'**accessibilitat** dels serveis que el joc fa servir de veritat
// (autenticació/sessions/perfil). Qualsevol resposta HTTP compta com a «accessible»; només la manca
// de resposta (xarxa caiguda, DNS, timeout) com a caiguda.
const MINECRAFT_SERVICES = [
    { id: 'session', url: 'https://sessionserver.mojang.com/' },
    { id: 'services', url: 'https://api.minecraftservices.com/' },
    { id: 'auth', url: 'https://login.microsoftonline.com/' } // `authserver.mojang.com` (Yggdrasil) ja està tancat
]
ipcMain.handle('hellmc:status-minecraft', async () => {
    const services = await Promise.all(MINECRAFT_SERVICES.map(async (svc) => {
        try {
            await fetch(svc.url, { method: 'HEAD', signal: AbortSignal.timeout(5000) })
            return { id: svc.id, ok: true }
        } catch {
            return { id: svc.id, ok: false }
        }
    }))
    return { services }
})
ipcMain.handle('hellmc:config-get', () => ({ ui: { ...ConfigManager.getUiConfig(), language: resolveLanguage() } }))
ipcMain.handle('hellmc:config-set', (_event, patch) => {
    // S4: només claus conegudes de la UI i amb el tipus correcte.
    const ui = Security.sanitizeUiPatch(patch?.ui)
    if (Object.keys(ui).length > 0) ConfigManager.setUiConfig(ui)
    ConfigManager.save()
    if ('discordPresence' in ui) syncMenuRpc()
})

// 2.5 (Configuració > Joc, resta de 07 §6): resolució/pantalla completa/autoconnect/launch
// detached/carpeta de dades. Cap camp nou a `configmanager.js` — tots ja existien (l'app antiga
// els té, només sense cap UI nova que hi arribés) i `ProcessBuilder` ja els llegeix directament
// de `ConfigManager` internament (`processbuilder.js:95/424/558/618/621/715/720/722`, mai rebuts
// per paràmetre) — persistir-los aquí ja n'hi ha prou perquè el proper «Jugar» els faci servir,
// sense tocar `hellmc:launch-start` gens.
ipcMain.handle('hellmc:game-settings-get', () => ({
    resWidth: ConfigManager.getGameWidth(),
    resHeight: ConfigManager.getGameHeight(),
    fullscreen: ConfigManager.getFullscreen(),
    autoConnect: ConfigManager.getAutoConnect(),
    launchDetached: ConfigManager.getLaunchDetached(),
    dataDirectory: ConfigManager.getDataDirectory(),
    pendingDataDirectory: ConfigManager.getPendingDataDirectory()
}))
ipcMain.handle('hellmc:game-settings-set', (_event, patch) => {
    if (patch.resWidth != null && ConfigManager.validateGameWidth(patch.resWidth)) ConfigManager.setGameWidth(patch.resWidth)
    if (patch.resHeight != null && ConfigManager.validateGameHeight(patch.resHeight)) ConfigManager.setGameHeight(patch.resHeight)
    if (patch.fullscreen != null) ConfigManager.setFullscreen(patch.fullscreen)
    if (patch.autoConnect != null) ConfigManager.setAutoConnect(patch.autoConnect)
    if (patch.launchDetached != null) ConfigManager.setLaunchDetached(patch.launchDetached)
    ConfigManager.save()
})
// `commonDir`/`instanceDir` (`DistroAPI`) i `dataPath` (`ConfigManager.getLauncherDirectory`'s
// sibling) es resolen un sol cop en arrencar l'app (dalt, `DistroAPI['commonDir'] = …`) — canviar
// la carpeta en calent no mouria cap dada ni refrescaria res que ja s'hagi llegit, per això
// només es desa la preferència i cal reiniciar (avisat a la UI, `GameSection.tsx`), mateix
// patró que qualsevol altre launcher que permet moure la carpeta de dades.
ipcMain.handle('hellmc:game-data-directory-pick', async (event) => {
    const senderWin = BrowserWindow.fromWebContents(event.sender)
    const result = await dialog.showOpenDialog(senderWin, { properties: ['openDirectory', 'createDirectory'] })
    if (result.canceled || result.filePaths.length === 0) return null
    const picked = result.filePaths[0]
    try {
        fs.accessSync(picked, fs.constants.W_OK)
    } catch {
        throw new Error('DIRECTORY_NOT_WRITABLE')
    }
    // No s'aplica en calent: queda «pendent» fins que es reinicia (`ConfigManager.load`).
    ConfigManager.setPendingDataDirectory(picked === ConfigManager.getDataDirectory() ? null : picked)
    ConfigManager.save()
    return picked
})
ipcMain.handle('hellmc:app-relaunch', () => {
    app.relaunch()
    app.exit(0)
})

module.exports = {

}
