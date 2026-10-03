const fs = require('fs-extra')
const { LoggerUtil } = require('hellmc-core')
const os = require('os')
const path = require('path')

const logger = LoggerUtil.getLogger('ConfigManager')

const sysRoot = process.env.APPDATA || (process.platform == 'darwin' ? process.env.HOME + '/Library/Application Support' : process.env.HOME)

const dataPath = path.join(sysRoot, '.hellmcclient')

const electron = require('electron')

function getApp() {
    return electron.app
}

exports.getLauncherDirectory = function () {
    return getApp().getPath('userData')
}

exports.getDataDirectory = function (def = false) {
    return !def ? config.settings.launcher.dataDirectory : DEFAULT_CONFIG.settings.launcher.dataDirectory
}

exports.setDataDirectory = function (dataDirectory) {
    config.settings.launcher.dataDirectory = dataDirectory
}

function getConfigPath() {
    return path.join(exports.getLauncherDirectory(), 'config.json')
}

const configPathLEGACY = path.join(dataPath, 'config.json')

// 01-terminologia-i-dades.md §5.1: bump when the persisted config shape changes.
const CONFIG_SCHEMA_VERSION = 2 // 01 §5.1: 2 = Fase 2 (`lastPlay`, comptes `offline`)

exports.getAbsoluteMinRAM = function (ram) {
    if (ram?.minimum != null) {
        return ram.minimum / 1024
    } else {
        // Legacy behavior
        const mem = os.totalmem()
        return 2
    }
}

exports.getAbsoluteMaxRAM = function (_ram) {

    const mem = os.totalmem()
    const gT16 = mem - (16 * 1073741824)
    return Math.floor((mem - (gT16 > 0 ? (Math.floor(gT16 / 8) + (16 * 1073741824) / 4) : mem / 4)) / 1073741824)
}

function resolveSelectedRAM(ram) {
    if (ram?.recommended != null) {
        return `${ram.recommended}M`
    } else {
        // Legacy behavior
        const mem = os.totalmem()
        return mem >= (8 * 1073741824) ? '4G' : (mem >= (6 * 1073741824) ? '2G' : '1G')
    }
}

/**
 * Three types of values:
 * Static = Explicitly declared.
 * Dynamic = Calculated by a private function.
 * Resolved = Resolved externally, defaults to null.
 */
const DEFAULT_CONFIG = {
    settings: {
        game: {
            resWidth: 1280,
            resHeight: 720,
            fullscreen: false,
            autoConnect: true,
            launchDetached: true
        },
        launcher: {
            allowPrerelease: false,
            dataDirectory: dataPath,
            language: 'es_ES'
        }
    },
    newsCache: {
        date: null,
        content: null,
        dismissed: false
    },
    clientToken: null,
    // Fase 1: `serverId` is populated once the player picks (or is preselected into) a server from
    // the catalog; null means "playing without a server" (D4). 01-terminologia-i-dades.md §5.
    lastPlay: { serverId: null, versionId: null }, // Resolved
    // Remembers, per server, the last version picked while playing through it (01 §5).
    lastVersionByServer: {},
    selectedAccount: null,
    authenticationDatabase: {},
    modConfigurations: [],
    javaConfig: {},
    // D26 (06 §8.2, 01 §3.1.1): preferència del **jugador** per versió (`shared`/`separate`) — no
    // s'ha de confondre amb `Version.dataSharing` (l'`forcedSeparate` de l'admin, ve de la
    // distribució, no viu aquí). `root: null` = arrel per defecte (`commonDir/shared-data`);
    // ruta absoluta explícita quan l'usuari tria la `.minecraft` del sistema (07 §6.2).
    dataSharing: {
        root: null,
        preferences: {}
    },
    // 2.4 (07 §5, «no llegit»): timestamp (ms) de l'última vegada que el jugador ha vist l'arxiu de
    // notícies per font (`'global'` o l'id del servidor) — un article és «nou» si el seu `date` és
    // posterior. Mapa dinàmic (com `javaConfig`), mai un esquema fix.
    newsRead: {},
    // 2.5 (06 §6, store `ui`): tema/rendiment/mida/barra lateral/idioma de la UI nova — abans només
    // vivia en memòria (`window.hellmc.config` mock), es perdia a cada reinici. `devMode` (07 §6,
    // «mode desenvolupador, ocult per defecte»): el valor persisteix igual, només la UI que el
    // revela (Launcher) el manté amagat fins que es desbloqueja (Sobre, clicar la versió).
    ui: {
        theme: 'system',
        performance: 'auto',
        uiScale: 100,
        sidebarCollapsed: false,
        language: 'en',
        devMode: false
    },
    // 2.5 (07 §6, «Java»: «valors globals per defecte»): seed per a `defaultJavaConfig` quan es
    // crea l'entrada d'una versió **nova** — `null` = segueix detectant/preguntant per versió com
    // fins ara (cap canvi de comportament si l'usuari no l'ha tocat mai). No s'ha de confondre amb
    // `javaConfig[versionId].executable` (per versió, 06 §5 `config.getVersion`/`setVersion`).
    globalJavaConfig: {
        executable: null
    },
    schemaVersion: CONFIG_SCHEMA_VERSION
}

let config = null

// Persistance Utility Functions

/**
 * Save the current configuration to a file.
 */
exports.save = function () {
    fs.writeFileSync(getConfigPath(), JSON.stringify(config, null, 4), 'UTF-8')
}

/**
 * Load the configuration into memory. If a configuration file exists,
 * that will be read and saved. Otherwise, a default configuration will
 * be generated. Note that "resolved" values default to null and will
 * need to be externally assigned.
 */
exports.load = function () {
    let doLoad = true
    const configPath = getConfigPath()

    if (!fs.existsSync(configPath)) {
        // Create all parent directories.
        fs.ensureDirSync(path.join(configPath, '..'))
        if (fs.existsSync(configPathLEGACY)) {
            fs.moveSync(configPathLEGACY, configPath)
        } else {
            doLoad = false
            config = DEFAULT_CONFIG
            exports.save()
        }
    }
    if (doLoad) {
        let doValidate = false
        try {
            config = JSON.parse(fs.readFileSync(configPath, 'UTF-8'))
            config = migrateLegacyConfig(config, configPath)
            doValidate = true
        } catch (err) {
            logger.error(err)
            logger.info('Configuration file contains malformed JSON or is corrupt.')
            logger.info('Generating a new configuration file.')
            fs.ensureDirSync(path.join(configPath, '..'))
            config = DEFAULT_CONFIG
            exports.save()
        }
        if (doValidate) {
            config = validateKeySet(DEFAULT_CONFIG, config)
            exports.save()
        }
    }
    logger.info('Successfully Loaded')
}

/**
 * 01-terminologia-i-dades.md §5.1: migrate the pre-fase-0 `selectedServer`
 * key (a raw version id) into `lastPlay`. `serverId` stays null here: fase 0
 * has no `Server` catalog to resolve it against.
 *
 * @param {Object} rawConfig The freshly parsed config.json contents.
 * @param {string} configPath Path of the config file being migrated, for the backup copy.
 * @returns {Object} The migrated config.
 */
function migrateLegacyConfig(rawConfig, configPath) {
    if (rawConfig == null) return rawConfig
    const needsLastPlay = rawConfig.lastPlay == null && Object.prototype.hasOwnProperty.call(rawConfig, 'selectedServer')
    const accounts = rawConfig.authenticationDatabase != null ? Object.values(rawConfig.authenticationDatabase) : []
    const needsAccountType = accounts.some((a) => a.type === 'mojang')
    if (needsLastPlay || needsAccountType) {
        // Còpia de seguretat abans de migrar (01 §5.1 pt.3); només la primera vegada.
        if (!fs.existsSync(`${configPath}.bak-v1`)) fs.copyFileSync(configPath, `${configPath}.bak-v1`)
    }
    if (needsLastPlay) {
        rawConfig.lastPlay = { serverId: null, versionId: rawConfig.selectedServer }
        delete rawConfig.selectedServer
    }
    // 07 §7.4 / 09 P1: el «compte Mojang» (només un nom, sense contrasenya) és un compte `offline`.
    for (const account of accounts) {
        if (account.type === 'mojang') account.type = 'offline'
    }
    rawConfig.schemaVersion = CONFIG_SCHEMA_VERSION
    return rawConfig
}

/**
 * @returns {boolean} Whether or not the manager has been loaded.
 */
exports.isLoaded = function () {
    return config != null
}

/**
 * Validate that the destination object has at least every field
 * present in the source object. Assign a default value otherwise.
 * 
 * @param {Object} srcObj The source object to reference against.
 * @param {Object} destObj The destination object.
 * @returns {Object} A validated destination object.
 */
function validateKeySet(srcObj, destObj) {
    if (srcObj == null) {
        srcObj = {}
    }
    const validationBlacklist = ['authenticationDatabase', 'javaConfig', 'lastVersionByServer', 'dataSharing', 'newsRead']
    const keys = Object.keys(srcObj)
    for (let i = 0; i < keys.length; i++) {
        if (typeof destObj[keys[i]] === 'undefined') {
            destObj[keys[i]] = srcObj[keys[i]]
        } else if (typeof srcObj[keys[i]] === 'object' && srcObj[keys[i]] != null && !(srcObj[keys[i]] instanceof Array) && validationBlacklist.indexOf(keys[i]) === -1) {
            destObj[keys[i]] = validateKeySet(srcObj[keys[i]], destObj[keys[i]])
        }
    }
    return destObj
}

/**
 * Check to see if this is the first time the user has launched the
 * application. This is determined by the existance of the data path.
 * 
 * @returns {boolean} True if this is the first launch, otherwise false.
 */
exports.isFirstLaunch = function () {
    return !fs.existsSync(getConfigPath()) && !fs.existsSync(configPathLEGACY)
}

/**
 * Returns the name of the folder in the OS temp directory which we
 * will use to extract and store native dependencies for game launch.
 * 
 * @returns {string} The name of the folder.
 */
exports.getTempNativeFolder = function () {
    return 'WCNatives'
}

// System Settings (Unconfigurable on UI)

/**
 * Retrieve the news cache to determine
 * whether or not there is newer news.
 * 
 * @returns {Object} The news cache object.
 */
exports.getNewsCache = function () {
    return config.newsCache
}

/**
 * Set the new news cache object.
 * 
 * @param {Object} newsCache The new news cache object.
 */
exports.setNewsCache = function (newsCache) {
    config.newsCache = newsCache
}

/**
 * Set whether or not the news has been dismissed (checked)
 * 
 * @param {boolean} dismissed Whether or not the news has been dismissed (checked).
 */
exports.setNewsCacheDismissed = function (dismissed) {
    config.newsCache.dismissed = dismissed
}

/**
 * Retrieve the common directory for shared
 * game files (assets, libraries, etc).
 * 
 * @returns {string} The launcher's common directory.
 */
exports.getCommonDirectory = function () {
    return path.join(exports.getDataDirectory(), 'common')
}

/**
 * Retrieve the instance directory for the per
 * version game directories.
 * 
 * @returns {string} The launcher's instance directory.
 */
exports.getInstanceDirectory = function () {
    return path.join(exports.getDataDirectory(), 'instances')
}

/**
 * Retrieve the launcher's Client Token.
 * There is no default client token.
 * 
 * @returns {string} The launcher's Client Token.
 */
exports.getClientToken = function () {
    return config.clientToken
}

/**
 * Set the launcher's Client Token.
 * 
 * @param {string} clientToken The launcher's new Client Token.
 */
exports.setClientToken = function (clientToken) {
    config.clientToken = clientToken
}

/**
 * Retrieve the ID of the selected version.
 *
 * @param {boolean} def Optional. If true, the default value will be returned.
 * @returns {string} The ID of the selected version.
 */
exports.getSelectedVersion = function (def = false) {
    return !def ? config.lastPlay.versionId : DEFAULT_CONFIG.lastPlay.versionId
}

/**
 * Set the ID of the selected version.
 *
 * @param {string} versionID The ID of the new selected version.
 */
exports.setSelectedVersion = function (versionID) {
    config.lastPlay.versionId = versionID
}

/**
 * Retrieve the ID of the selected server (D4: null = playing without a server).
 *
 * @returns {string|null} The ID of the selected server, or null.
 */
exports.getSelectedServer = function () {
    return config.lastPlay.serverId
}

/**
 * Set the ID of the selected server (fase 1). Does not touch `lastPlay.versionId`; callers pick the
 * version separately (usually the server's recommended one, or `lastVersionByServer[serverId]`).
 *
 * @param {string|null} serverID The ID of the new selected server, or null for "no server".
 */
exports.setSelectedServer = function (serverID) {
    config.lastPlay.serverId = serverID
}

/**
 * Retrieve the version last played through a given server, if any.
 *
 * @param {string} serverID The server id.
 * @returns {string|undefined} The version id, if one is remembered for this server.
 */
exports.getLastVersionByServer = function (serverID) {
    return config.lastVersionByServer[serverID]
}

/**
 * Remember the version last played through a given server.
 *
 * @param {string} serverID The server id.
 * @param {string} versionID The version id picked for this server.
 */
exports.setLastVersionByServer = function (serverID, versionID) {
    config.lastVersionByServer[serverID] = versionID
}

/**
 * Get an array of each account currently authenticated by the launcher.
 * 
 * @returns {Array.<Object>} An array of each stored authenticated account.
 */
exports.getAuthAccounts = function () {
    return config.authenticationDatabase
}

/**
 * Returns the authenticated account with the given uuid. Value may
 * be null.
 * 
 * @param {string} uuid The uuid of the authenticated account.
 * @returns {Object} The authenticated account with the given uuid.
 */
exports.getAuthAccount = function (uuid) {
    return config.authenticationDatabase[uuid]
}

/**
 * Update the access token of an authenticated mojang account.
 * 
 * @param {string} uuid The uuid of the authenticated account.
 * @param {string} accessToken The new Access Token.
 * 
 * @returns {Object} The authenticated account object created by this action.
 */
exports.updateMojangAuthAccount = function (uuid, accessToken) {
    config.authenticationDatabase[uuid].accessToken = accessToken
    config.authenticationDatabase[uuid].type = 'offline'
    return config.authenticationDatabase[uuid]
}

/**
 * Adds an authenticated mojang account to the database to be stored.
 * 
 * @param {string} uuid The uuid of the authenticated account.
 * @param {string} accessToken The accessToken of the authenticated account.
 * @param {string} username The username (usually email) of the authenticated account.
 * @param {string} displayName The in game name of the authenticated account.
 * 
 * @returns {Object} The authenticated account object created by this action.
 */
exports.addMojangAuthAccount = function (uuid, accessToken, username, displayName) {
    config.selectedAccount = uuid
    config.authenticationDatabase[uuid] = {
        type: 'offline',
        accessToken,
        username: username.trim(),
        uuid: uuid.trim(),
        displayName: displayName.trim()
    }
    return config.authenticationDatabase[uuid]
}

/**
 * Update the tokens of an authenticated microsoft account.
 * 
 * @param {string} uuid The uuid of the authenticated account.
 * @param {string} accessToken The new Access Token.
 * @param {string} msAccessToken The new Microsoft Access Token
 * @param {string} msRefreshToken The new Microsoft Refresh Token
 * @param {date} msExpires The date when the microsoft access token expires
 * @param {date} mcExpires The date when the mojang access token expires
 * 
 * @returns {Object} The authenticated account object created by this action.
 */
exports.updateMicrosoftAuthAccount = function (uuid, accessToken, msAccessToken, msRefreshToken, msExpires, mcExpires) {
    config.authenticationDatabase[uuid].accessToken = accessToken || config.authenticationDatabase[uuid].accessToken
    config.authenticationDatabase[uuid].expiresAt = mcExpires || config.authenticationDatabase[uuid].expiresAt
    config.authenticationDatabase[uuid].microsoft.access_token = msAccessToken || config.authenticationDatabase[uuid].microsoft.access_token
    config.authenticationDatabase[uuid].microsoft.refresh_token = msRefreshToken || config.authenticationDatabase[uuid].microsoft.refresh_token
    config.authenticationDatabase[uuid].microsoft.expires_at = msExpires || config.authenticationDatabase[uuid].microsoft.expires_at
    return config.authenticationDatabase[uuid]
}


/**
 * Adds an authenticated microsoft account to the database to be stored.
 * 
 * @param {string} uuid The uuid of the authenticated account.
 * @param {string} accessToken The accessToken of the authenticated account.
 * @param {string} name The in game name of the authenticated account.
 * @param {date} mcExpires The date when the mojang access token expires
 * @param {string} msAccessToken The microsoft access token
 * @param {string} msRefreshToken The microsoft refresh token
 * @param {date} msExpires The date when the microsoft access token expires
 * 
 * @returns {Object} The authenticated account object created by this action.
 */
exports.addMicrosoftAuthAccount = function (uuid, accessToken, name, mcExpires, msAccessToken, msRefreshToken, msExpires) {
    config.selectedAccount = uuid
    config.authenticationDatabase[uuid] = {
        type: 'microsoft',
        accessToken,
        username: name.trim(),
        uuid: uuid.trim(),
        displayName: name.trim(),
        expiresAt: mcExpires,
        microsoft: {
            access_token: msAccessToken,
            refresh_token: msRefreshToken,
            expires_at: msExpires
        }
    }
    return config.authenticationDatabase[uuid]
}

/**
 * Remove an authenticated account from the database. If the account
 * was also the selected account, a new one will be selected. If there
 * are no accounts, the selected account will be null.
 * 
 * @param {string} uuid The uuid of the authenticated account.
 * 
 * @returns {boolean} True if the account was removed, false if it never existed.
 */
exports.removeAuthAccount = function (uuid) {
    if (config.authenticationDatabase[uuid] != null) {
        delete config.authenticationDatabase[uuid]
        if (config.selectedAccount === uuid) {
            const keys = Object.keys(config.authenticationDatabase)
            if (keys.length > 0) {
                config.selectedAccount = keys[0]
            } else {
                config.selectedAccount = null
                config.clientToken = null
            }
        }
        return true
    }
    return false
}

/**
 * Get the currently selected authenticated account.
 * 
 * @returns {Object} The selected authenticated account.
 */
exports.getSelectedAccount = function () {
    return config.authenticationDatabase[config.selectedAccount]
}

/**
 * Set the selected authenticated account.
 * 
 * @param {string} uuid The UUID of the account which is to be set
 * as the selected account.
 * 
 * @returns {Object} The selected authenticated account.
 */
exports.setSelectedAccount = function (uuid) {
    const authAcc = config.authenticationDatabase[uuid]
    if (authAcc != null) {
        config.selectedAccount = uuid
    }
    return authAcc
}

/**
 * Get an array of each mod configuration currently stored.
 * 
 * @returns {Array.<Object>} An array of each stored mod configuration.
 */
exports.getModConfigurations = function () {
    return config.modConfigurations
}

/**
 * Set the array of stored mod configurations.
 * 
 * @param {Array.<Object>} configurations An array of mod configurations.
 */
exports.setModConfigurations = function (configurations) {
    config.modConfigurations = configurations
}

/**
 * Get the mod configuration for a specific version.
 * 
 * @param {string} versionid The id of the version.
 * @returns {Object} The mod configuration for the given version.
 */
exports.getModConfiguration = function (versionid) {
    const cfgs = config.modConfigurations
    for (let i = 0; i < cfgs.length; i++) {
        if (cfgs[i].id === versionid) {
            return cfgs[i]
        }
    }
    return null
}

/**
 * Set the mod configuration for a specific version. This overrides any existing value.
 * 
 * @param {string} versionid The id of the version for the given mod configuration.
 * @param {Object} configuration The mod configuration for the given version.
 */
exports.setModConfiguration = function (versionid, configuration) {
    const cfgs = config.modConfigurations
    for (let i = 0; i < cfgs.length; i++) {
        if (cfgs[i].id === versionid) {
            cfgs[i] = configuration
            return
        }
    }
    cfgs.push(configuration)
}

/**
 * D26 (06 §8.2): whether the player wants THIS version's shareable data (saves, resourcepacks,
 * shaderpacks, screenshots, options.txt, optionsof.txt, servers.dat, hotbar.nbt — 01 §3.1.1) linked
 * against the shared root, or kept as a real separate folder. Defaults to shared (`true`) unless the
 * player has explicitly turned it off before. Callers still need to check the admin's
 * `Version.dataSharing === 'forcedSeparate'` separately — that one is never overridden by this.
 *
 * @param {string} versionid The id of the version.
 * @returns {boolean} True if the player wants this version's data shared.
 */
exports.getDataSharingPreference = function (versionid) {
    const pref = config.dataSharing.preferences[versionid]
    return pref !== undefined ? pref : true
}

/**
 * Set the player's data-sharing preference for a specific version.
 *
 * @param {string} versionid The id of the version.
 * @param {boolean} shared True to link against the shared root, false to keep it separate.
 */
exports.setDataSharingPreference = function (versionid, shared) {
    config.dataSharing.preferences[versionid] = shared
}

/**
 * D26 (07 §6.2): root folder that every `shared` version links its shareable data against. A single
 * global root, not per-version. `null` (the default) resolves to `<commonDir>/shared-data`, HellMC's
 * own folder — isolated from any other Minecraft install (06 §8.2, kept apart from the "system
 * .minecraft" option on purpose so opting in to sharing never touches an existing install unasked).
 *
 * @returns {string} The absolute path of the shared-data root.
 */
exports.getSharedDataRoot = function () {
    return config.dataSharing.root != null ? config.dataSharing.root : path.join(exports.getCommonDirectory(), 'shared-data')
}

/**
 * Set the shared-data root. Pass `null` to go back to HellMC's own default folder.
 *
 * @param {string|null} root The absolute path to use, or `null` for the default.
 */
exports.setSharedDataRoot = function (root) {
    config.dataSharing.root = root
}

/**
 * 2.5 (06 §6, store `ui`): tema/rendiment/mida/barra lateral/idioma/mode desenvolupador de la UI
 * nova. Un sol objecte pla (no un mapa per id com `javaConfig`) — `window.hellmc.config.get/set`
 * en llegeix/escriu el bloc sencer.
 *
 * @returns {Object} El bloc `ui` complet.
 */
exports.getUiConfig = function () {
    return config.ui
}

/**
 * @param {Object} patch Claus a actualitzar (`Object.assign` superficial, no substitueix el bloc
 * sencer) — perquè un `config.set({ui: {theme: 'dark'}})` des del renderer mai esborri la resta
 * de claus que no ha tocat.
 */
exports.setUiConfig = function (patch) {
    Object.assign(config.ui, patch)
}

/**
 * 2.4 (07 §5): when the player last saw a news source's archive, as a Unix ms timestamp. `0` if
 * never (every article counts as unread).
 *
 * @param {string} sourceId `'global'` or a server id.
 * @returns {number}
 */
exports.getNewsLastSeen = function (sourceId) {
    return config.newsRead[sourceId] ?? 0
}

/**
 * Set when the player last saw a news source's archive.
 *
 * @param {string} sourceId `'global'` or a server id.
 * @param {number} timestamp Unix ms timestamp.
 */
exports.setNewsLastSeen = function (sourceId, timestamp) {
    config.newsRead[sourceId] = timestamp
}

// User Configurable Settings

// Java Settings

function defaultJavaConfig(effectiveJavaOptions, ram) {
    if (effectiveJavaOptions.suggestedMajor > 8) {
        return defaultJavaConfig17(ram)
    } else {
        return defaultJavaConfig8(ram)
    }
}

function defaultJavaConfig8(ram) {
    return {
        minRAM: resolveSelectedRAM(ram),
        maxRAM: resolveSelectedRAM(ram),
        executable: config.globalJavaConfig.executable,
        jvmOptions: [
            '-XX:+UseConcMarkSweepGC',
            '-XX:+CMSIncrementalMode',
            '-XX:-UseAdaptiveSizePolicy',
            '-Xmn128M'
        ],
    }
}

function defaultJavaConfig17(ram) {
    return {
        minRAM: resolveSelectedRAM(ram),
        maxRAM: resolveSelectedRAM(ram),
        executable: config.globalJavaConfig.executable,
        jvmOptions: [
            '-XX:+UnlockExperimentalVMOptions',
            '-XX:+UseG1GC',
            '-XX:G1NewSizePercent=20',
            '-XX:G1ReservePercent=20',
            '-XX:MaxGCPauseMillis=50',
            '-XX:G1HeapRegionSize=32M'
        ],
    }
}

/**
 * Ensure a java config property is set for the given version.
 * 
 * @param {string} versionid The version id.
 * @param {*} mcVersion The minecraft version of the version.
 */
exports.ensureJavaConfig = function (versionid, effectiveJavaOptions, ram) {
    if (!Object.prototype.hasOwnProperty.call(config.javaConfig, versionid)) {
        config.javaConfig[versionid] = defaultJavaConfig(effectiveJavaOptions, ram)
    }
}

/**
 * Retrieve the minimum amount of memory for JVM initialization. This value
 * contains the units of memory. For example, '5G' = 5 GigaBytes, '1024M' = 
 * 1024 MegaBytes, etc.
 * 
 * @param {string} versionid The version id.
 * @returns {string} The minimum amount of memory for JVM initialization.
 */
exports.getMinRAM = function (versionid) {
    return config.javaConfig[versionid].minRAM
}

/**
 * Set the minimum amount of memory for JVM initialization. This value should
 * contain the units of memory. For example, '5G' = 5 GigaBytes, '1024M' = 
 * 1024 MegaBytes, etc.
 * 
 * @param {string} versionid The version id.
 * @param {string} minRAM The new minimum amount of memory for JVM initialization.
 */
exports.setMinRAM = function (versionid, minRAM) {
    config.javaConfig[versionid].minRAM = minRAM
}

/**
 * Retrieve the maximum amount of memory for JVM initialization. This value
 * contains the units of memory. For example, '5G' = 5 GigaBytes, '1024M' = 
 * 1024 MegaBytes, etc.
 * 
 * @param {string} versionid The version id.
 * @returns {string} The maximum amount of memory for JVM initialization.
 */
exports.getMaxRAM = function (versionid) {
    return config.javaConfig[versionid].maxRAM
}

/**
 * Set the maximum amount of memory for JVM initialization. This value should
 * contain the units of memory. For example, '5G' = 5 GigaBytes, '1024M' = 
 * 1024 MegaBytes, etc.
 * 
 * @param {string} versionid The version id.
 * @param {string} maxRAM The new maximum amount of memory for JVM initialization.
 */
exports.setMaxRAM = function (versionid, maxRAM) {
    config.javaConfig[versionid].maxRAM = maxRAM
}

/**
 * Retrieve the path of the Java Executable.
 * 
 * This is a resolved configuration value and defaults to null until externally assigned.
 * 
 * @param {string} versionid The version id.
 * @returns {string} The path of the Java Executable.
 */
exports.getJavaExecutable = function (versionid) {
    return config.javaConfig[versionid].executable
}

/**
 * Set the path of the Java Executable.
 * 
 * @param {string} versionid The version id.
 * @param {string} executable The new path of the Java Executable.
 */
exports.setJavaExecutable = function (versionid, executable) {
    config.javaConfig[versionid].executable = executable
}

/**
 * Retrieve the additional arguments for JVM initialization. Required arguments,
 * such as memory allocation, will be dynamically resolved and will not be included
 * in this value.
 * 
 * @param {string} versionid The version id.
 * @returns {Array.<string>} An array of the additional arguments for JVM initialization.
 */
exports.getJVMOptions = function (versionid) {
    return config.javaConfig[versionid].jvmOptions
}

/**
 * Set the additional arguments for JVM initialization. Required arguments,
 * such as memory allocation, will be dynamically resolved and should not be
 * included in this value.
 * 
 * @param {string} versionid The version id.
 * @param {Array.<string>} jvmOptions An array of the new additional arguments for JVM 
 * initialization.
 */
exports.setJVMOptions = function (versionid, jvmOptions) {
    config.javaConfig[versionid].jvmOptions = jvmOptions
}

/**
 * 2.5 (07 §6 «Java», valors globals): ruta de l'executable Java usada com a llavor en crear
 * l'entrada d'una versió nova (`defaultJavaConfig*`, dalt) — no toca cap versió ja configurada.
 *
 * @returns {string|null} L'executable global, o `null` si no se n'ha triat cap.
 */
exports.getGlobalJavaExecutable = function () {
    return config.globalJavaConfig.executable
}

/**
 * @param {string|null} executable Ruta de l'executable, o `null` per tornar a «cap» (auto-detecció
 * normal per versió).
 */
exports.setGlobalJavaExecutable = function (executable) {
    config.globalJavaConfig.executable = executable
}

// Game Settings

/**
 * Retrieve the width of the game window.
 * 
 * @param {boolean} def Optional. If true, the default value will be returned.
 * @returns {number} The width of the game window.
 */
exports.getGameWidth = function (def = false) {
    return !def ? config.settings.game.resWidth : DEFAULT_CONFIG.settings.game.resWidth
}

/**
 * Set the width of the game window.
 * 
 * @param {number} resWidth The new width of the game window.
 */
exports.setGameWidth = function (resWidth) {
    config.settings.game.resWidth = Number.parseInt(resWidth)
}

/**
 * Validate a potential new width value.
 * 
 * @param {number} resWidth The width value to validate.
 * @returns {boolean} Whether or not the value is valid.
 */
exports.validateGameWidth = function (resWidth) {
    const nVal = Number.parseInt(resWidth)
    return Number.isInteger(nVal) && nVal >= 0
}

/**
 * Retrieve the height of the game window.
 * 
 * @param {boolean} def Optional. If true, the default value will be returned.
 * @returns {number} The height of the game window.
 */
exports.getGameHeight = function (def = false) {
    return !def ? config.settings.game.resHeight : DEFAULT_CONFIG.settings.game.resHeight
}

/**
 * Set the height of the game window.
 * 
 * @param {number} resHeight The new height of the game window.
 */
exports.setGameHeight = function (resHeight) {
    config.settings.game.resHeight = Number.parseInt(resHeight)
}

/**
 * Validate a potential new height value.
 * 
 * @param {number} resHeight The height value to validate.
 * @returns {boolean} Whether or not the value is valid.
 */
exports.validateGameHeight = function (resHeight) {
    const nVal = Number.parseInt(resHeight)
    return Number.isInteger(nVal) && nVal >= 0
}

/**
 * Check if the game should be launched in fullscreen mode.
 * 
 * @param {boolean} def Optional. If true, the default value will be returned.
 * @returns {boolean} Whether or not the game is set to launch in fullscreen mode.
 */
exports.getFullscreen = function (def = false) {
    return !def ? config.settings.game.fullscreen : DEFAULT_CONFIG.settings.game.fullscreen
}

/**
 * Change the status of if the game should be launched in fullscreen mode.
 * 
 * @param {boolean} fullscreen Whether or not the game should launch in fullscreen mode.
 */
exports.setFullscreen = function (fullscreen) {
    config.settings.game.fullscreen = fullscreen
}

/**
 * Check if the game should auto connect to servers.
 * 
 * @param {boolean} def Optional. If true, the default value will be returned.
 * @returns {boolean} Whether or not the game should auto connect to servers.
 */
exports.getAutoConnect = function (def = false) {
    return !def ? config.settings.game.autoConnect : DEFAULT_CONFIG.settings.game.autoConnect
}

/**
 * Change the status of whether or not the game should auto connect to servers.
 * 
 * @param {boolean} autoConnect Whether or not the game should auto connect to servers.
 */
exports.setAutoConnect = function (autoConnect) {
    config.settings.game.autoConnect = autoConnect
}

/**
 * Check if the game should launch as a detached process.
 * 
 * @param {boolean} def Optional. If true, the default value will be returned.
 * @returns {boolean} Whether or not the game will launch as a detached process.
 */
exports.getLaunchDetached = function (def = false) {
    return !def ? config.settings.game.launchDetached : DEFAULT_CONFIG.settings.game.launchDetached
}

/**
 * Change the status of whether or not the game should launch as a detached process.
 * 
 * @param {boolean} launchDetached Whether or not the game should launch as a detached process.
 */
exports.setLaunchDetached = function (launchDetached) {
    config.settings.game.launchDetached = launchDetached
}

// Launcher Settings

/**
 * Check if the launcher should download prerelease versions.
 * 
 * @param {boolean} def Optional. If true, the default value will be returned.
 * @returns {boolean} Whether or not the launcher should download prerelease versions.
 */
exports.getAllowPrerelease = function (def = false) {
    return !def ? config.settings.launcher.allowPrerelease : DEFAULT_CONFIG.settings.launcher.allowPrerelease
}

/**
 * Change the status of Whether or not the launcher should download prerelease versions.
 * 
 * @param {boolean} launchDetached Whether or not the launcher should download prerelease versions.
 */
exports.setAllowPrerelease = function (allowPrerelease) {
    config.settings.launcher.allowPrerelease = allowPrerelease
}

/**
 * Retrieve the current language.
 * 
 * @returns {string} The current language.
 */
exports.getLanguage = function () {
    return config.settings.launcher.language
}

/**
 * Set the current language.
 * 
 * @param {string} language The new language.
 */
exports.setLanguage = function (language) {
    config.settings.launcher.language = language
}