'use strict'
// Discord Rich Presence (en partida i al menú).
// Mòdul del procés principal d'Electron (abans tot era a index.js). Registra els seus handlers IPC en carregar-se.
const { path, ConfigManager, resolveLanguage, fs } = require('./core')
const { runningInstances } = require('./instances')



// ── Discord RPC «en partida» (P17, 06 §8.1): mòdul presence del HellMC Runtime ────────────────────────────────
// El mòdul `presence` del runtime (HellMC-Runtime/presence) viu dins el procés del joc i
// llegeix `hellmc-presence.json` de la carpeta d'instància — aquí s'escriu abans de cada llançament
// amb el que ve del `distribution.json` (`discord` global + `server.discord`) i els textos traduïts.
const PRESENCE_TEXTS = {
    en: { menu: 'In the main menu', singleplayer: 'Playing singleplayer', joining: 'Loading…', joined: 'Playing on {server}', playingAt: 'Playing on {ip}', localServer: 'Local server', titleSingleplayer: 'Singleplayer', titleMultiplayer: 'Multiplayer (3rd-party Server)' },
    es: { menu: 'En el menú principal', singleplayer: 'Jugando en solitario', joining: 'Cargando…', joined: 'Jugando en {server}', playingAt: 'Jugando en {ip}', localServer: 'Servidor local', titleSingleplayer: 'Un jugador', titleMultiplayer: 'Multijugador (servidor de terceros)' },
    ca: { menu: 'Al menú principal', singleplayer: 'Jugant en solitari', joining: 'Carregant…', joined: 'Jugant a {server}', playingAt: 'Jugant a {ip}', localServer: 'Servidor local', titleSingleplayer: 'Un jugador', titleMultiplayer: 'Multijugador (servidor de tercers)' }
}
function writePresenceConfig(gameDir, rawDistribution, rawServer, version) {
    const gen = rawDistribution.discord
    const file = path.join(gameDir, 'hellmc-presence.json')
    // Sense Discord configurat el fitxer s'escriu igualment (sense `clientId`): el mod no fa Rich Presence, però sí el
    // títol i la icona de la finestra. Sense fitxer, el mod no fa res.
    const language = ConfigManager.getUiConfig()?.language ?? resolveLanguage()
    const serv = rawServer?.discord
    const config = {
        // D9: sense «Mostrar activitat a Discord» el mod no fa Rich Presence (però sí el títol i la icona de la finestra).
        clientId: ConfigManager.getUiConfig().discordPresence === false ? null : (gen?.clientId ?? null),
        versionName: version.name,
        // Títol de la finestra del joc: «HellMC Client <versió de Minecraft> - Singleplayer…».
        windowTitle: 'HellMC Client',
        minecraftVersion: version.minecraftVersion,
        serverName: rawServer?.name ?? null,
        serverShortId: serv?.shortId ?? null,
        // Mateixa assignació que feia el launcher antic (`discordwrapper.js`).
        largeImageKey: gen?.smallImageKey ?? null,
        largeImageText: gen?.smallImageText ?? null,
        smallImageKey: serv?.largeImageKey ?? null,
        smallImageText: serv?.largeImageText ?? null,
        startTimestamp: Date.now(),
        texts: PRESENCE_TEXTS[language] ?? PRESENCE_TEXTS.en
    }
    fs.writeFileSync(file, JSON.stringify(config, null, 2))
}

// ── Discord RPC «al menú» (P17, 06 §8.1) ──────────────────────────────────────────────────────
// Activa mentre el launcher és obert i no hi ha cap partida; en llançar el joc el launcher la
// tanca i el mòdul in-game (HellMC-Presence) en pren el relleu; en tancar l'última partida torna.
const DiscordWrapper = require('../../app/assets/js/discordwrapper')
let menuRpcSettings = null
function syncMenuRpc() {
    if (menuRpcSettings == null) return
    if (runningInstances.size === 0 && ConfigManager.getUiConfig().discordPresence !== false) {
        DiscordWrapper.initRPC(menuRpcSettings, null)
    } else {
        DiscordWrapper.shutdownRPC()
    }
}

/** La primera vegada que arriba la distribució amb la configuració de Discord del servidor, s'adopta i s'activa el RPC «al menú» (només aquest mòdul en té l'estat). */
function useDistroDiscordSettings(rawDistribution) {
    if (menuRpcSettings == null && rawDistribution.discord?.clientId != null) {
        menuRpcSettings = rawDistribution.discord
        syncMenuRpc()
    }
}

module.exports = {
    DiscordWrapper,
    syncMenuRpc,
    useDistroDiscordSettings,
    writePresenceConfig
}
