import { useEffect, useState } from 'preact/hooks'
import { Play, Search, Star } from 'lucide-preact'
import { t } from '../i18n'
import { Art, Chip, ServerIcon, StatusDot } from '../components/ui'
import { navigate } from '../router'
import { distro, distroLoading } from '../stores/distro'
import { effectiveSelection, selectServer } from '../stores/selection'
import { pings, pingServer } from '../stores/status'

// 07 §3.1: graella de targetes grans + targeta especial «Jugar sense servidor» sempre primera,
// cerca i filtre per etiqueta. Columnes via CSS grid `auto-fill` (08 §6).

function PingLine({ serverId, versions }: { serverId: string; versions: number }) {
  const ping = pings.value[serverId]
  const versionsText = t('servers.versionsCount', { count: versions })
  if (ping == null || ping.state === 'loading') {
    return <div class="status-line"><StatusDot state="off" /><span>…</span><span>·</span><span>{versionsText}</span></div>
  }
  return (
    <div class="status-line">
      <StatusDot state={ping.online ? 'on' : 'off'} />
      {ping.online && ping.players != null
        ? <span class="num">{ping.players.online}/{ping.players.max}</span>
        : <span>{t('ui.noConnection')}</span>}
      <span>·</span><span>{versionsText}</span>
    </div>
  )
}

export function Servers() {
  const d = distro.value
  const [query, setQuery] = useState('')
  const [tag, setTag] = useState<string | null>(null)
  const selectedId = effectiveSelection.value.serverId

  // F4: depèn del *contingut* (ids+adreces), no de la referència de `d` (que canvia a cada refresc de la distribució).
  const serversKey = (d?.servers ?? []).map((s) => `${s.id}@${s.address}`).join('|')
  useEffect(() => {
    for (const server of d?.servers ?? []) void pingServer(server.id, server.address)
  }, [serversKey])

  const allTags = [...new Set((d?.servers ?? []).flatMap((s) => s.tags ?? []))]
  const servers = (d?.servers ?? [])
    .filter((s) => tag == null || (s.tags ?? []).includes(tag))
    .filter((s) => s.name.toLowerCase().includes(query.trim().toLowerCase()))

  function playWithoutServer() {
    void selectServer(null)
    navigate('/versions')
  }

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

      {allTags.length > 0 && (
        <div class="filters" role="group" aria-label={t('ui.filterByTag')}>
          <button type="button" class="chip" aria-pressed={tag == null} onClick={() => setTag(null)}>{t('ui.all')}</button>
          {allTags.map((x) => (
            <button key={x} type="button" class="chip" aria-pressed={tag === x} onClick={() => setTag(tag === x ? null : x)}>{x}</button>
          ))}
        </div>
      )}

      {distroLoading.value && <p class="muted">{t('home.loadingDistro')}</p>}

      <div class="server-grid">
        <div class="card scard free" role="button" tabIndex={0} onClick={playWithoutServer}
          onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); playWithoutServer() } }}>
          <div class="ring"><Play size={24} fill="currentColor" /></div>
          <h3>{t('servers.playWithoutServer')}</h3>
          <p class="muted small" style={{ maxWidth: '26ch' }}>{t('servers.playWithoutServerDesc')}</p>
          <span class="btn sm">{t('ui.pickVersion')}</span>
        </div>

        {d != null && d.servers.length === 0 && !distroLoading.value && <p class="muted" style={{ gridColumn: '1 / -1' }}>{t('servers.empty')}</p>}

        {servers.map((server) => (
          <div key={server.id} class={`card scard${server.id === selectedId ? ' selected' : ''}`} role="link" tabIndex={0}
            onClick={() => navigate(`/servers/${server.id}`)}
            onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); navigate(`/servers/${server.id}`) } }}>
            <Art seed={server.id} url={server.banner} />
            {server.mainServer === true && <span class="star"><Star size={12} fill="currentColor" /> {t('ui.main')}</span>}
            <div class="body">
              <div class="head"><ServerIcon name={server.name} seed={server.id} url={server.icon} /><h3>{server.name}</h3></div>
              <p class="d">{server.description}</p>
              {(server.tags ?? []).length > 0 && <div class="tags">{server.tags!.map((x) => <Chip key={x}>{x}</Chip>)}</div>}
              <div class="foot">
                <PingLine serverId={server.id} versions={server.versions.length} />
                <span class={`btn sm${server.mainServer === true ? ' primary' : ''}`}>{t('home.play')}</span>
              </div>
            </div>
          </div>
        ))}
      </div>
    </>
  )
}
