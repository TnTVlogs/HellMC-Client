'use strict'

// Skins i capes del compte (docs/client-cosmetics/14-skins.md).
//  - Comptes Microsoft: API oficial de Minecraft Services (canvi real, visible per a tothom).
//  - Biblioteca LOCAL de skins (també per a comptes offline: només es desa en local, mai es puja enlloc).
// Aquest mòdul no depèn d'Electron: el token i `fetch` s'injecten (així es pot provar). El token de
// Minecraft viu només aquí/al procés principal; el renderer mai el veu.

const fs = require('fs')
const path = require('path')
const crypto = require('crypto')

const MC_SERVICES = 'https://api.minecraftservices.com'
const MOJANG_API = 'https://api.mojang.com'
const SESSION_SERVER = 'https://sessionserver.mojang.com'
const TEXTURE_HOST = 'textures.minecraft.net'
const MAX_PNG_BYTES = 1024 * 1024
const MAX_LIBRARY = 200
const VARIANTS = ['classic', 'slim']
const PngUtil = require('./pngutil')

class SkinsError extends Error {
    constructor(code, detail) {
        super(`SKINS_ERROR:${code}`)
        this.code = code
        this.detail = detail
    }
}

/**
 * Comprova i NETEJA una skin: només PNG de 64×64 o 64×32 (els únics que accepta Minecraft), amb l'estructura sencera validada (CRC, blocs,
 * mida de les dades) i reescrit sense metadades ni res després de l'IEND. És el que es desa, es mostra, s'envia a Mojang i llegeix el joc.
 * @returns {{data: Buffer, width: number, height: number}}
 */
function parsePng(buffer) {
    try {
        return PngUtil.clean(buffer, { maxWidth: 64, maxHeight: 64, maxBytes: MAX_PNG_BYTES, sizes: [[64, 64], [64, 32]] })
    } catch (err) {
        if (err instanceof PngUtil.PngError) throw new SkinsError(/mida \d+×\d+ (no permesa|fora de límits)/.test(err.reason) ? 'INVALID_SIZE' : 'INVALID_PNG', err.reason)
        throw new SkinsError('INVALID_PNG')
    }
}

function dataUrl(buffer) {
    return `data:image/png;base64,${buffer.toString('base64')}`
}

/** Mojang serveix les textures com a http://textures.minecraft.net/…; s'accepta http i https del seu host i es baixa sempre per https. */
function isTextureUrl(value) {
    try {
        const url = new URL(value)
        return (url.protocol === 'https:' || url.protocol === 'http:') && url.hostname === TEXTURE_HOST
    } catch {
        return false
    }
}

function secureTextureUrl(value) {
    return value.replace(/^http:/, 'https:')
}

function isValidMinecraftName(name) {
    return typeof name === 'string' && /^[A-Za-z0-9_]{1,16}$/.test(name)
}

/**
 * @param {object} options
 * @param {typeof fetch} options.fetchFn
 * @param {() => Promise<string|null>} options.getToken token de Minecraft del compte Microsoft actiu (ja validat), o null
 * @param {string} options.libraryDir carpeta de la biblioteca local
 */
function create({ fetchFn, getToken, libraryDir }) {
    const libraryFile = path.join(libraryDir, 'library.json')

    // ── xarxa ──────────────────────────────────────────────────────────────────────────────
    async function request(url, init, { auth = false, timeoutMs = 15000 } = {}) {
        const headers = { ...(init && init.headers) }
        if (auth) {
            const token = await getToken()
            if (token == null) throw new SkinsError('NO_TOKEN')
            headers.Authorization = `Bearer ${token}`
        }
        let response
        try {
            response = await fetchFn(url, { ...init, headers, signal: AbortSignal.timeout(timeoutMs) })
        } catch (err) {
            throw new SkinsError('NETWORK', String(err && err.message))
        }
        if (response.status === 401 || response.status === 403) throw new SkinsError('NO_TOKEN')
        if (response.status === 404) throw new SkinsError('NOT_FOUND')
        if (response.status === 429) throw new SkinsError('RATE_LIMITED')
        if (response.status === 400) throw new SkinsError('REJECTED', await safeText(response))
        if (!response.ok) throw new SkinsError('HTTP_ERROR', String(response.status))
        return response
    }
    async function safeText(response) {
        try {
            return (await response.text()).slice(0, 300)
        } catch {
            return ''
        }
    }

    function mapProfile(raw) {
        const mapTexture = (item, extra) => ({ id: String(item.id), url: secureTextureUrl(String(item.url)), active: item.state === 'ACTIVE', ...extra(item) })
        return {
            uuid: String(raw.id),
            name: String(raw.name),
            skins: (raw.skins || []).filter((s) => isTextureUrl(s.url)).map((s) => mapTexture(s, (i) => ({ variant: i.variant === 'SLIM' ? 'slim' : 'classic' }))),
            capes: (raw.capes || []).filter((c) => isTextureUrl(c.url)).map((c) => mapTexture(c, (i) => ({ alias: String(i.alias || '') })))
        }
    }

    /** Perfil del compte actiu: skin i capes (amb les que té i quina és activa). */
    async function getProfile() {
        const response = await request(`${MC_SERVICES}/minecraft/profile`, { method: 'GET' }, { auth: true })
        return mapProfile(await response.json())
    }

    async function setSkinFromPng(input, variant) {
        const buffer = parsePng(input).data
        if (!VARIANTS.includes(variant)) throw new SkinsError('INVALID_VARIANT')
        const form = new FormData()
        form.append('variant', variant)
        form.append('file', new Blob([buffer], { type: 'image/png' }), 'skin.png')
        const response = await request(`${MC_SERVICES}/minecraft/profile/skins`, { method: 'POST', body: form }, { auth: true, timeoutMs: 30000 })
        return mapProfile(await response.json())
    }

    /** `capeId` = id d'una capa que el compte ja té, o null per amagar-la. */
    async function setActiveCape(capeId) {
        if (capeId == null) {
            const response = await request(`${MC_SERVICES}/minecraft/profile/capes/active`, { method: 'DELETE' }, { auth: true })
            return mapProfile(await response.json())
        }
        if (typeof capeId !== 'string' || !/^[0-9a-fA-F-]{8,64}$/.test(capeId)) throw new SkinsError('INVALID_CAPE')
        const response = await request(`${MC_SERVICES}/minecraft/profile/capes/active`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ capeId })
        }, { auth: true })
        return mapProfile(await response.json())
    }

    /** Baixa una textura oficial i la retorna com a data URL (així el renderer no depèn de CORS ni fa xarxa). */
    async function fetchTexture(url) {
        if (!isTextureUrl(url)) throw new SkinsError('INVALID_URL')
        const response = await request(secureTextureUrl(url), { method: 'GET' })
        const length = Number(response.headers?.get('content-length'))
        if (Number.isFinite(length) && length > MAX_PNG_BYTES) throw new SkinsError('INVALID_PNG')
        const raw = Buffer.from(await response.arrayBuffer())
        let buffer
        try {
            buffer = PngUtil.clean(raw, { maxWidth: 2048, maxHeight: 1024, maxBytes: MAX_PNG_BYTES }).data
        } catch {
            throw new SkinsError('INVALID_PNG')
        }
        return { buffer, dataUrl: dataUrl(buffer) }
    }

    /** Skin i capa públiques d'un jugador pel seu nom (per importar). */
    async function lookupByName(name) {
        if (!isValidMinecraftName(name)) throw new SkinsError('INVALID_NAME')
        const idResponse = await request(`${MOJANG_API}/users/profiles/minecraft/${encodeURIComponent(name)}`, { method: 'GET' })
        const { id, name: realName } = await idResponse.json()
        if (typeof id !== 'string' || !/^[0-9a-f]{32}$/i.test(id)) throw new SkinsError('NOT_FOUND')
        const profileResponse = await request(`${SESSION_SERVER}/session/minecraft/profile/${id}`, { method: 'GET' })
        const profile = await profileResponse.json()
        const prop = (profile.properties || []).find((p) => p.name === 'textures')
        if (prop == null) throw new SkinsError('NOT_FOUND')
        let textures
        try {
            textures = JSON.parse(Buffer.from(prop.value, 'base64').toString('utf8')).textures || {}
        } catch {
            throw new SkinsError('NOT_FOUND')
        }
        const skin = textures.SKIN
        // Un jugador sense skin pròpia no té entrada SKIN: no hi ha res a importar.
        if (skin == null || !isTextureUrl(skin.url)) throw new SkinsError('NOT_FOUND')
        return {
            name: String(realName || name),
            skinUrl: secureTextureUrl(skin.url),
            variant: skin.metadata && skin.metadata.model === 'slim' ? 'slim' : 'classic',
            capeUrl: textures.CAPE && isTextureUrl(textures.CAPE.url) ? secureTextureUrl(textures.CAPE.url) : null
        }
    }

    // ── biblioteca local ───────────────────────────────────────────────────────────────────
    function readIndex() {
        try {
            const raw = JSON.parse(fs.readFileSync(libraryFile, 'utf8'))
            return {
                skins: Array.isArray(raw.skins) ? raw.skins.filter((s) => s && /^[0-9a-f]{12}$/.test(s.id)) : [],
                selection: raw.selection && typeof raw.selection === 'object' ? raw.selection : {}
            }
        } catch {
            return { skins: [], selection: {} }
        }
    }
    function writeIndex(index) {
        fs.mkdirSync(libraryDir, { recursive: true })
        const tmp = `${libraryFile}.tmp`
        fs.writeFileSync(tmp, JSON.stringify(index, null, 2))
        fs.renameSync(tmp, libraryFile)
    }
    function pngPath(id) {
        if (!/^[0-9a-f]{12}$/.test(id)) throw new SkinsError('INVALID_ID')
        return path.join(libraryDir, `${id}.png`)
    }
    function cleanName(name) {
        const value = typeof name === 'string' ? name.replace(/[\u0000-\u001f]/g, '').trim().slice(0, 40) : ''
        return value === '' ? 'Skin' : value
    }

    function listLibrary() {
        const index = readIndex()
        return {
            skins: index.skins.map((s) => ({ id: s.id, name: s.name, variant: s.variant, source: s.source, addedAt: s.addedAt })),
            selection: index.selection
        }
    }

    function addToLibrary({ name, variant, png: input, source }) {
        const png = parsePng(input).data
        if (!VARIANTS.includes(variant)) throw new SkinsError('INVALID_VARIANT')
        const index = readIndex()
        if (index.skins.length >= MAX_LIBRARY) throw new SkinsError('LIBRARY_FULL')
        const id = crypto.randomBytes(6).toString('hex')
        fs.mkdirSync(libraryDir, { recursive: true })
        fs.writeFileSync(pngPath(id), png)
        const entry = { id, name: cleanName(name), variant, source: typeof source === 'string' ? source.slice(0, 40) : 'file', addedAt: new Date().toISOString() }
        index.skins.push(entry)
        writeIndex(index)
        return entry
    }

    function removeFromLibrary(id) {
        const index = readIndex()
        const before = index.skins.length
        index.skins = index.skins.filter((s) => s.id !== id)
        if (index.skins.length === before) return
        for (const uuid of Object.keys(index.selection)) if (index.selection[uuid] === id) delete index.selection[uuid]
        try {
            fs.rmSync(pngPath(id), { force: true })
        } catch {
            // el PNG ja no hi és: res a fer
        }
        writeIndex(index)
    }

    function renameInLibrary(id, name) {
        const index = readIndex()
        const entry = index.skins.find((s) => s.id === id)
        if (entry == null) throw new SkinsError('NOT_FOUND')
        entry.name = cleanName(name)
        writeIndex(index)
    }

    function setVariantInLibrary(id, variant) {
        if (!VARIANTS.includes(variant)) throw new SkinsError('INVALID_VARIANT')
        const index = readIndex()
        const entry = index.skins.find((s) => s.id === id)
        if (entry == null) throw new SkinsError('NOT_FOUND')
        entry.variant = variant
        writeIndex(index)
    }

    function readLibraryPng(id) {
        const index = readIndex()
        if (!index.skins.some((s) => s.id === id)) throw new SkinsError('NOT_FOUND')
        const buffer = fs.readFileSync(pngPath(id))
        return { buffer, dataUrl: dataUrl(buffer) }
    }

    /** Skin que un compte (típicament offline) té «posada» en local; la llegirà el runtime del joc. */
    function setLocalSelection(accountUuid, id) {
        if (typeof accountUuid !== 'string' || accountUuid === '') throw new SkinsError('INVALID_ID')
        const index = readIndex()
        if (id == null) delete index.selection[accountUuid]
        else if (index.skins.some((s) => s.id === id)) index.selection[accountUuid] = id
        else throw new SkinsError('NOT_FOUND')
        writeIndex(index)
    }

    return {
        getProfile, setSkinFromPng, setActiveCape, fetchTexture, lookupByName,
        listLibrary, addToLibrary, removeFromLibrary, renameInLibrary, setVariantInLibrary, readLibraryPng, setLocalSelection
    }
}

module.exports = { create, parsePng, SkinsError, isTextureUrl, isValidMinecraftName }
