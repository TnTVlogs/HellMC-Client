'use strict'
// Actualitzacions automàtiques del client (electron-updater).
// Mòdul del procés principal d'Electron (abans tot era a index.js). Registra els seus handlers IPC en carregar-se.
const { semver, app, autoUpdater, isDev, path, ipcMain, ConfigManager } = require('./core')
const { getWindow } = require('./window')
const { ROOT } = require('./core')



// Setup auto updater.
//
// 2.5 (Configuració > Actualitzacions): petició explícita de l'usuari, «com el de Discord» —
// mai cap assistent NSIS visible i l'actualització «es fa sola». Dues peces calien, no només
// codi: `electron-builder.yml` tenia `nsis.oneClick: false` (assistent multi-pas, es veu
// sempre, també en una actualització silenciosa — `isSilent` de `quitAndInstall` només
// suprimeix la UI de l'INSTAL·LADOR, no evita l'assistent si el paquet es va construir amb
// `oneClick:false`); canviat a `oneClick: true`. Amb això, `autoDownload` (ja `true` per
// defecte; a `darwin` es manté `false`: l'app no està signada i només s'avisa, vegeu més avall)
// + `autoInstallOnAppQuit` (per defecte `true`, només desactivat a `isDev`) ja basten: es
// baixa en segon pla sense preguntar i s'instal·la sola el proper cop que l'app es tanqui del
// tot, sense cap diàleg «Reinicia ara?».
//
// `configureAutoUpdater` es crida un cop en arrencar (`app.on('ready', …)` més avall) i reenvia
// els esdeveniments a la finestra principal (`win`) si existeix.
function broadcastUpdaterEvent(updaterEvent) {
    if (getWindow() != null && !getWindow().isDestroyed()) {
        getWindow().webContents.send('hellmc:updater-event', updaterEvent)
    }
}
/**
 * Canal de les versions de prova. electron-updater (GitHub) només troba una release si l'etiqueta és de la forma `vX.Y.Z-alpha.N` o
 * `vX.Y.Z-beta.N` (primer identificador de la pre-versió = `alpha` o `beta`, SENSE número enganxat: «alpha2» es llegeix com un canal propi i
 * no veu mai l'«alpha3»). El client mira el canal del seu propi tipus (`alpha` o `beta`): des d'un `alpha` veu els `alpha` nous i també els
 * `beta` (es pot passar d'alpha a beta, mai a l'inrevés). Un client estable no fixa canal.
 */
function updaterChannelFor(version) {
    const id = semver.prerelease(version)?.[0]
    const match = typeof id === 'string' ? /^(alpha|beta)/.exec(id) : null
    return match != null ? match[1] : null
}

function configureAutoUpdater(allowPrerelease) {
    // Un client de prova (versió amb pre-versió) ha de poder veure sempre les pre-releases, encara que l'ajust guardat digui el contrari.
    const currentIsPrerelease = (semver.prerelease(app.getVersion()) ?? []).length > 0
    autoUpdater.allowPrerelease = currentIsPrerelease ? true : allowPrerelease === true
    const channel = updaterChannelFor(app.getVersion())
    if (channel != null) {
        autoUpdater.channel = channel
        autoUpdater.allowDowngrade = false       // fixar el canal activa `allowDowngrade` per defecte: no es vol baixar mai de versió
    }

    if (isDev) {
        autoUpdater.autoInstallOnAppQuit = false
        autoUpdater.updateConfigPath = path.join(ROOT, 'dev-app-update.yml')
    }
    // macOS sense signatura (Developer ID): Squirrel.Mac no instal·laria res. Només s'avisa que hi ha una
    // versió nova (`update-available`) i la interfície porta a la pàgina de descàrrega; no es baixa res.
    if (process.platform === 'darwin') {
        autoUpdater.autoDownload = false
        autoUpdater.autoInstallOnAppQuit = false
    }
    autoUpdater.removeAllListeners()
    autoUpdater.on('checking-for-update', () => {
        broadcastUpdaterEvent({ type: 'checking-for-update' })
    })
    autoUpdater.on('update-available', (info) => {
        broadcastUpdaterEvent({ type: 'update-available', info })
    })
    autoUpdater.on('update-not-available', (info) => {
        broadcastUpdaterEvent({ type: 'update-not-available', info })
    })
    autoUpdater.on('download-progress', (progress) => {
        broadcastUpdaterEvent({ type: 'download-progress', info: { percent: progress.percent } })
    })
    autoUpdater.on('update-downloaded', (info) => {
        broadcastUpdaterEvent({ type: 'update-downloaded', info })
        // Deliberadament NO es demana res aquí: `autoInstallOnAppQuit` ja instal·la en silenci
        // (oneClick, cap assistent) el proper cop que l'app es tanqui del tot.
    })
    autoUpdater.on('error', (err) => {
        broadcastUpdaterEvent({ type: 'error', info: { message: err?.message ?? String(err) } })
    })
}

// 2.5 (`window.hellmc.updater`, 06 §5): `check` desencadena la mateixa comprovació silenciosa
// (els resultats arriben per `hellmc:updater-event`, mai com a valor resolt — `checkForUpdates`
// només confirma que la comprovació s'ha iniciat). `install` força la instal·lació ara mateix
// (`isSilent:true` — mai assistent, encara que `oneClick` ja ho garanteix igualment;
// `isForceRunAfter:true` reobre l'app, com Discord) — només té sentit cridar-ho després d'un
// `update-downloaded`; si no hi ha res baixat, `quitAndInstall` no fa res perillós (electron-updater
// ho ignora), no calia guardar estat propi per evitar-ho.
ipcMain.handle('hellmc:updater-check', async () => {
    try {
        await autoUpdater.checkForUpdates()
    } catch (err) {
        // Sense xarxa o sense configuració d'actualitzacions: es notifica com a esdeveniment, no com a error d'IPC.
        broadcastUpdaterEvent({ type: 'error', info: { message: err?.message ?? String(err) } })
    }
})
ipcMain.handle('hellmc:updater-install', () => {
    autoUpdater.quitAndInstall(true, true)
})
// 07 §6 «Actualitzacions» → canal (estable/prerelease): `allowPrerelease` es desa a `config.json`
// (`settings.launcher.allowPrerelease`, ja existent) i s'aplica a l'updater en arrencar i en canviar-lo.
ipcMain.handle('hellmc:updater-get-prerelease', () => ConfigManager.getAllowPrerelease())
ipcMain.handle('hellmc:updater-set-prerelease', (_event, allow) => {
    // Un build prerelease no ha de poder baixar a estable sense voler (mateixa regla que l'app antiga).
    const currentIsPrerelease = (semver.prerelease(app.getVersion()) ?? []).length > 0
    const effective = currentIsPrerelease ? true : !!allow
    ConfigManager.setAllowPrerelease(effective)
    ConfigManager.save()
    autoUpdater.allowPrerelease = effective
    return effective
})

module.exports = {
    configureAutoUpdater
}
