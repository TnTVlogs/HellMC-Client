const fs = require('fs-extra')
const path = require('path')
const toml = require('toml')
const merge = require('lodash.merge')

let lang

exports.loadLanguage = function (id) {
    lang = merge(lang || {}, toml.parse(fs.readFileSync(path.join(__dirname, '..', 'lang', `${id}.toml`))) || {})
}

exports.query = function (id, placeHolders) {
    let query = id.split('.')
    let res = lang
    for (let q of query) {
        if (!res || !res[q]) {
            return ''
        }
        res = res[q]
    }
    let text = res === lang ? '' : res
    if (placeHolders && typeof text === 'string') {
        Object.entries(placeHolders).forEach(([key, value]) => {
            text = text.replace(`{${key}}`, value)
        })
    }
    return text
}

exports.queryJS = function (id, placeHolders) {
    return exports.query(`js.${id}`, placeHolders)
}

exports.queryEJS = function (id, placeHolders) {
    return exports.query(`ejs.${id}`, placeHolders)
}

exports.setupLanguage = function () {
    const ConfigManager = require('./configmanager')
    if (!ConfigManager.isLoaded()) {
        ConfigManager.load()
    }
    const selectedLang = ConfigManager.getLanguage() || 'es_ES'

    // Reset lang to ensure clean load/merge
    lang = {}

    // Load EN first as the base fallback (it has all keys usually)
    exports.loadLanguage('en_US')

    // Finally load the selected language (if it's not en_US)
    if (selectedLang !== 'en_US') {
        try {
            exports.loadLanguage(selectedLang)
        } catch (e) {
            console.error('Failed to load selected language', selectedLang, e)
        }
    }

    // Load Custom Language File for Launcher Customizer
    exports.loadLanguage('_custom')
}
