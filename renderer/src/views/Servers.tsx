import { useEffect, useState } from 'preact/hooks'
import { Play, Search, Star, WifiOff } from 'lucide-preact'
import { t } from '../i18n'
import { Art, Banner, Chip, ServerIcon, StatusDot } from '../components/ui'
import { Skeleton, SkeletonGroup } from '../components/Skeleton'
import { Tooltip } from '../components/Tooltip'
import { navigate } from '../router'
import { distro, distroLoading } from '../stores/distro'
import { effectiveSelection, selectServer } from '../stores/selection'
import { online } from '../stores/network'
import { pings, watchPing } from '../stores/status'
import { formatDuration } from '../utils/format'

// 07 §3.1: graella de targetes grans + targeta especial «Jugar sense servidor» sempre primera,
// cerca i filtre per etiqueta. Columnes via CSS grid `auto-fill` (08 §6).
// Sense xarxa: la distribució ve de la memòria cau del procés principal i els jugadors, de l'últim ping desat
// (`stores/status.ts`); es mostra un avís i les dades antigues es marquen com a tals.

/** Màxim d'etiquetes per targeta (12 C9): la resta es resumeix en «+N». */
export const MAX_CARD_TAGS = 3

function PingLine({ serverId, versions }: { serverId: string; versions: number }) {
  const ping = pings.value[serverId]
  const versionsText = t('servers.versionsCount', { count: versions })
  if (ping == null || ping.state === 'loading') {
    return <div class="status-line" aria-busy="true"><StatusDot state="off" /><Skeleton width={44} height={12} /><span>·</span><span>{versionsText}</span></div>
  }
  const stale = ping.stale === true
  const age = stale && ping.at != null ? t('servers.lastKnown', { time: formatDuration((Date.now() - ping.at) / 1000) }) : undefined
  return (
    <Tooltip content={age}>
      <div class="status-line">
        <StatusDot state={stale ? 'warn' : ping.online ? 'on' : 'off'} />
        {ping.online && ping.players != null
          ? <span class={`num${stale ? ' stale' : ''}`}>{ping.players.online}/{ping.players.max}</span>
          : <span>{t('ui.noConnection')}</span>}
        {stale && <span class="stale">{t('servers.offlineStale')}</span>}
        <span>·</span><span>{versionsText}</span>
      </div>
    </Tooltip>
  )
}

/** Targeta d'esquelet mentre carrega la distribució (mateixa mida que `.scard`). */
function ServerCardSkeleton() {
  return (
    <div class="card scard" aria-hidden="true">
      <div class="art"><Skeleton height="100%" radius={0} /></div>
      <div class="body">
        <div class="head"><Skeleton width={40} height={40} radius={10} /><Skeleton width="55%" height={18} /></div>
        <Skeleton width="90%" /><Skeleton width="65%" />
        <div class="foot"><Skeleton width={90} height={12} /><Skeleton width={64} height={32} radius={8} /></div>
      </div>
    </div>
  )
}

export function Servers() {
  const d = distro.value
  const [query, setQuery] = useState('')
  const [tag, setTag] = useState<string | null>(null)
  const selectedId = effectiveSelection.value.serverId

  // F4: depèn del *contingut* (ids+adreces), no de la referència de `d` (que canvia a cada refresc de la distribució).
  // Cada servidor es vigila mentre la vista és oberta: ping ara, cada minut i en tornar a la pestanya (només visible).
  const serversKey = (d?.servers ?? []).map((s) => `${s.id}@${s.address}`).join('|')
  useEffect(() => {
    const stops = (d?.servers ?? []).map((server) => watchPing(server.id, server.address))
    return () => { for (const stop of stops) stop() }
  }, [serversKey])

  const allTags = [...new Set((d?.servers ?? []).flatMap((s) => s.tags ?? []))]
  const servers = (d?.servers ?? [])
    .filter((s) => tag == null || (s.tags ?? []).includes(tag))
    .filter((s) => s.name.toLowerCase().includes(query.trim().toLowerCase()))

  function playWithoutServer() {
    void selectServer(null)
    navigate('/versions')
  }

  const loadingFirst = distroLoading.value && d == null

  return (
    <>
      <div class="page-head">
        <div class="grow"><h1>{t('nav.servers')}</h1><p>{t('ui.serversSubtitle')}</p></div>
        <div class="search">
          <Search size={18} />
          <input class="field" placeholder={t('ui.searchServer')} aria-label={t('ui.search')} value={query}
            onInput={(e) => setQuery((e.target as HTMLInputElement).value)} />
        </div>
      </div>

      {!online.value && d != null && <Banner tone="warn" icon={WifiOff}>{t('servers.offlineCache')}</Banner>}

      {allTags.length > 0 && (
        <div class="filters" role="group" aria-label={t('ui.filterByTag')}>
          <button type="button" class="chip" aria-pressed={tag == null} onClick={() => setTag(null)}>{t('ui.all')}</button>
          {allTags.map((x) => (
            <button key={x} type="button" class="chip" aria-pressed={tag === x} onClick={() => setTag(tag === x ? null : x)}>{x}</button>
          ))}
        </div>
      )}

      {distroLoading.value && !loadingFirst && <p class="muted">{t('home.loadingDistro')}</p>}

      {loadingFirst ? (
        <SkeletonGroup label={t('home.loadingDistro')} class="server-grid">
          {[0, 1, 2].map((i) => <ServerCardSkeleton key={i} />)}
        </SkeletonGroup>
      ) : (
        <div class="server-grid">
          <div class="card scard free" role="button" tabIndex={0} onClick={playWithoutServer}
            onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); playWithoutServer() } }}>
            <div class="ring"><Play size={24} fill="currentColor" /></div>
            <h3>{t('servers.playWithoutServer')}</h3>
            <p class="muted small" style={{ maxWidth: '26ch' }}>{t('servers.playWithoutServerDesc')}</p>
            <span class="btn sm">{t('ui.pickVersion')}</span>
          </div>

          {d != null && d.servers.length === 0 && !distroLoading.value && <p class="muted" style={{ gridColumn: '1 / -1' }}>{t('servers.empty')}</p>}

          {servers.map((server) => {
            const tags = server.tags ?? []
            return (
              <div key={server.id} class={`card scard${server.id === selectedId ? ' selected' : ''}`} role="link" tabIndex={0}
                onClick={() => navigate(`/servers/${server.id}`)}
                onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); navigate(`/servers/${server.id}`) } }}>
                <Art seed={server.id} url={server.banner} />
                {server.mainServer === true && <span class="star"><Star size={12} fill="currentColor" /> {t('ui.main')}</span>}
                <div class="body">
                  <div class="head"><ServerIcon name={server.name} seed={server.id} url={server.icon} /><h3>{server.name}</h3></div>
                  <p class="d">{server.description}</p>
                  {tags.length > 0 && (
                    <div class="tags">
                      {tags.slice(0, MAX_CARD_TAGS).map((x) => <Chip key={x}>{x}</Chip>)}
                      {tags.length > MAX_CARD_TAGS && <Tooltip content={tags.slice(MAX_CARD_TAGS).join(', ')}><Chip>+{tags.length - MAX_CARD_TAGS}</Chip></Tooltip>}
                    </div>
                  )}
                  <div class="foot">
                    <PingLine serverId={server.id} versions={server.versions.length} />
                    <span class={`btn sm${server.mainServer === true ? ' primary' : ''}`}>{t('home.play')}</span>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </>
  )
}
