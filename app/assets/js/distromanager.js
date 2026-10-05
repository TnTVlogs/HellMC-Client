const { DistributionAPI, Ed25519Verifier } = require('hellmc-core/common')
const SIGNING_KEYS = require('./signing-keys')

const ConfigManager = require('./configmanager')

// Old WesterosCraft url.
// exports.REMOTE_DISTRO_URL = 'http://mc.westeroscraft.com/WesterosCraftLauncher/distribution.json'
exports.REMOTE_DISTRO_URL = 'https://hellmcclient.sergidalmau.dev/client/distribution-v2.json'

const api = new DistributionAPI(
    ConfigManager.getLauncherDirectory(),
    null, // Injected forcefully by the preloader.
    null, // Injected forcefully by the preloader.
    exports.REMOTE_DISTRO_URL,
    false,
    // S1: sense claus configurades la signatura no s'exigeix (vegeu signing-keys.js).
    SIGNING_KEYS.length > 0 ? new Ed25519Verifier(SIGNING_KEYS) : null
)

exports.SIGNING_KEYS = SIGNING_KEYS

exports.DistroAPI = api