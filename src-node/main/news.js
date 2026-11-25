'use strict'
// Notícies (RSS global i per servidor, amb caché).
// Mòdul del procés principal d'Electron (abans tot era a index.js). Registra els seus handlers IPC en carregar-se.
const { path, ConfigManager, fs, Security, rssParser, ipcMain, assertId, DistroAPI } = require('./core')



// ── 2.4 (bàsic): notícies (RSS global + per servidor, amb cache per a D24 sense connexió) ──────
function getNewsCachePath() {
    return path.join(ConfigManager.getLauncherDirectory(), 'newscache.json')
}
function readNewsCache() {
    try {
        return JSON.parse(fs.readFileSync(getNewsCachePath(), 'utf-8'))
    } catch {
        return {}
    }
}
function writeNewsCacheEntry(scopeKey, entry) {
    const cache = readNewsCache()
    cache[scopeKey] = entry
    try {
        fs.writeFileSync(getNewsCachePath(), JSON.stringify(cache))
    } catch { /* millor perdre la cache que petar la resposta */ }
}

// S11: baixada del feed amb https obligatori, amfitrió públic, *timeout* i límit de mida (2 MB) abans de passar-ho a `rss-parser`.
const MAX_FEED_BYTES = 2 * 1024 * 1024
async function fetchFeed(rawUrl) {
    const url = Security.safeFeedUrl(rawUrl)
    if (url == null) throw new Error('FEED_URL_NOT_ALLOWED')
    const response = await fetch(url, { signal: AbortSignal.timeout(8000), headers: { accept: 'application/rss+xml, application/atom+xml, application/xml, text/xml, */*' } })
    if (!response.ok) throw new Error(`FEED_HTTP_${response.status}`)
    const reader = response.body.getReader()
    const chunks = []
    let total = 0
    for (;;) {
        const { done, value } = await reader.read()
        if (done) break
        total += value.length
        if (total > MAX_FEED_BYTES) {
            await reader.cancel()
            throw new Error('FEED_TOO_LARGE')
        }
        chunks.push(value)
    }
    return rssParser.parseString(Buffer.concat(chunks).toString('utf8'))
}

function normalizeFeedItem(item, feedUrl) {
    const dateStr = item.isoDate ?? item.pubDate
    const date = dateStr != null ? Date.parse(dateStr) : Number.NaN
    return {
        // L'id inclou el feed: dues fonts amb el mateix `guid` no han de col·lidir a la llista de la UI.
        id: `${feedUrl}|${item.guid ?? item.link ?? `${item.title ?? ''}#${date}`}`,
        title: item.title ?? '',
        date: Number.isNaN(date) ? Date.now() : date,
        url: item.link ?? feedUrl,
        summary: item.contentSnippet ?? item.summary,
        // 2.4 completes (07 §5): calien per a l'autor i el lector dins l'app — `news-get` (2.1/2.2)
        // mai els havia necessitat (només la targeta Jugar/detall de servidor, cap lectura completa).
        author: item.creator ?? item.author,
        // Acotat: el contingut complet es desa a `newscache.json` i es pinta; un feed enorme no ha d'inflar res.
        content: String(item.content ?? item.contentSnippet ?? item.summary ?? '').slice(0, 100_000)
    }
}

// Extret de l'antic `hellmc:news-get` perquè `hellmc:news-archive` (tots els orígens alhora, 07 §5)
// el reutilitzi sense duplicar el fetch+cache per origen — un sol lloc que sap parlar amb
// `rss-parser` i la cache de disc.
async function fetchNewsSource(scopeKey, feedUrls) {
    const activeFeedUrls = feedUrls.filter((url) => url != null)
    if (activeFeedUrls.length === 0) {
        return { items: [], fromCache: false, fetchedAt: Date.now() }
    }
    const results = await Promise.allSettled(activeFeedUrls.map((url) => fetchFeed(url)))
    const items = []
    let anySucceeded = false
    results.forEach((result, i) => {
        if (result.status === 'fulfilled') {
            anySucceeded = true
            for (const item of result.value.items) items.push(normalizeFeedItem(item, activeFeedUrls[i]))
        }
    })
    if (!anySucceeded) {
        const cached = readNewsCache()[scopeKey]
        if (cached != null) return { items: cached.items, fromCache: true, fetchedAt: cached.fetchedAt }
        return { items: [], fromCache: false, fetchedAt: Date.now() }
    }
    items.sort((a, b) => b.date - a.date)
    items.splice(50)
    const fetchedAt = Date.now()
    writeNewsCacheEntry(scopeKey, { items, fetchedAt })
    return { items, fromCache: false, fetchedAt }
}

ipcMain.handle('hellmc:news-get', async (_event, scope) => {
    assertId(scope?.serverId, { nullable: true })
    const distro = await DistroAPI.getDistribution()
    const feedUrls = [distro.rawDistribution.rss]
    if (scope?.serverId != null) {
        const server = distro.rawDistribution.servers.find((s) => s.id === scope.serverId)
        if (server?.rss != null) feedUrls.push(server.rss)
    }
    return fetchNewsSource(scope?.serverId ?? 'global', feedUrls)
})

// Totes les fonts (07 §5, arxiu complet): `'global'` + un origen per servidor amb `rss` propi —
// mai fusionats en un sol feed (a diferència de `news-get`, que sí fusiona global+servidor per a la
// secció d'un `ServerDetail`, 2.2/§9): l'arxiu necessita saber de QUIN origen és cada article per
// poder-lo filtrar per pestanya.
function getNewsSources(distro) {
    const sources = [{ id: 'global', name: null, url: distro.rawDistribution.rss }]
    for (const server of distro.rawDistribution.servers ?? []) {
        if (server.rss != null) sources.push({ id: server.id, name: server.name, url: server.rss })
    }
    return sources.filter((s) => s.url != null)
}

ipcMain.handle('hellmc:news-archive', async () => {
    const distro = await DistroAPI.getDistribution()
    const sources = getNewsSources(distro)
    const results = await Promise.all(sources.map((s) => fetchNewsSource(s.id, [s.url])))

    const items = []
    let fromCache = false
    let oldestFetchedAt = null
    results.forEach((result, i) => {
        const source = sources[i]
        const lastSeen = ConfigManager.getNewsLastSeen(source.id)
        for (const item of result.items) {
            items.push({ ...item, source: { id: source.id, name: source.name }, unread: item.date > lastSeen })
        }
        if (result.fromCache) {
            fromCache = true
            if (oldestFetchedAt == null || result.fetchedAt < oldestFetchedAt) oldestFetchedAt = result.fetchedAt
        }
    })
    items.sort((a, b) => b.date - a.date)

    return {
        items,
        sources: sources.map((s) => ({ id: s.id, name: s.name })),
        fromCache,
        fetchedAt: fromCache ? oldestFetchedAt : Date.now()
    }
})

// Marca com a «vist» **ara** cada origen — cridat pel renderer just després de carregar l'arxiu
// (mai en obtenir-lo, són passos separats a propòsit: primer es mostra què hi ha de nou, després es
// marca com a llegit). Article publicat després d'aquest moment → `unread` al proper `news-archive`.
ipcMain.handle('hellmc:news-mark-read', async () => {
    const distro = await DistroAPI.getDistribution()
    const now = Date.now()
    for (const source of getNewsSources(distro)) {
        ConfigManager.setNewsLastSeen(source.id, now)
    }
    ConfigManager.save()
})

module.exports = {

}
