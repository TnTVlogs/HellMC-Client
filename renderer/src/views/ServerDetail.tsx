import { useEffect, useState } from 'preact/hooks'
import { marked } from 'marked'
import { sanitizeRichHtml } from '../utils/sanitize'
import { Check, Copy, ExternalLink, Play, Star } from 'lucide-preact'
import { t } from '../i18n'
import { hellmc, type NewsItem } from '../api'
import { Button } from '../components/Button'
import { Card } from '../components/Card'
import { Art, Chip, ServerIcon, StatusDot } from '../components/ui'
import { navigate } from '../router'
import { distro } from '../stores/distro'
import { selectServer, selectVersion } from '../stores/selection'
import { launch } from '../stores/launch'
import { pings, pingServer } from '../stores/status'
import { statuses, refreshStatus } from '../stores/versions'
import { formatBytes } from '../utils/format'

// 07 §3.2: detall del servidor — hero, descripció (Markdown sanititzat), notícies del servidor,
// i a la dreta desplegable de versions + Jugar + dades. «Jugar» selecciona i navega a Inici, on hi
// ha la UI de progrés (store `launch` compartit).

export function ServerDetail({ id }: { id: string }) {
  const d = distro.value
  const server = d?.servers.find((s) => s.id === id) ?? null
  const [versionId, setVersionId] = useState<string | null>(null)
  const [news, setNews] = useState<NewsItem[]>([])
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    if (server == null) return
    void pingServer(server.id, server.address)
    hellmc.selection.getLastVersionForServer(server.id).then((stored) => {
      if (stored != null && server.versions.some((v) => v.id === stored)) {
        setVersionId(stored)
        return
      }
      const recommended = server.versions.find((v) => v.recommended === true) ?? server.versions[0]
      setVersionId(recommended?.id ?? null)
    }).catch(() => { /* es queda la recomanada */ })
    if (server.rss != null) hellmc.news.get({ serverId: server.id }).then((r) => setNews(r.items.slice(0, 5))).catch(() => { /* sense notícies */ })
    for (const entry of server.versions) void refreshStatus(entry.id)
    // Només `server?.id`: el refresc de `distro` canvia la referència de `server` a cada poll.
  }, [server?.id])

  if (d == null) return <p class="muted">{t('home.loadingDistro')}</p>
  if (server == null) {
    return (
      <Card pad>
        <p class="muted">{t('serverDetail.notFound')}</p>
        <Button style={{ marginTop: 'var(--space-3)' }} onClick={() => navigate('/servers')}>{t('serverDetail.back')}</Button>
      </Card>
    )
  }

  const ping = pings.value[server.id]
  const options = server.versions
    .map((entry) => ({ entry, version: d.versions.find((v) => v.id === entry.id) }))
    .filter((x): x is { entry: typeof x.entry; version: NonNullable<typeof x.version> } => x.version != null)
  const current = options.find((o) => o.entry.id === versionId)?.version ?? null
  const status = versionId != null ? statuses.value[versionId] : undefined
  const longHtml = server.descriptionLong != null && server.descriptionLong.trim() !== ''
    ? sanitizeRichHtml(marked.parse(server.descriptionLong, { async: false }))
    : null

  async function handlePlay() {
    if (versionId == null) return
    await selectServer(server!.id)
    await selectVersion(versionId)
    await hellmc.selection.setLastVersionForServer(server!.id, versionId)
    navigate('/home')
    await launch({ serverId: server!.id, versionId })
  }

  async function copyAddress() {
    await navigator.clipboard.writeText(server!.address)
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }

  const versionSelect = (
    <select class="field" style={{ width: '100%' }} aria-label={t('serverDetail.version')} value={versionId ?? ''}
      onChange={(e) => setVersionId((e.target as HTMLSelectElement).value)}>
      {options.map(({ entry, version }) => (
        <option key={entry.id} value={entry.id}>{version.label ?? version.name}{entry.recommended === true ? ` · ${t('serverDetail.recommended')}` : ''}</option>
      ))}
    </select>
  )

  return (
    <>
      <div><a class="small" href="#/servers">← {t('nav.servers')}</a></div>

      <section class="card server-hero">
        <Art seed={server.id} url={server.banner} />
        <div class="hb">
          <ServerIcon name={server.name} seed={server.id} url={server.icon} />
          <div class="grow">
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
              <h1 style={{ fontSize: 'var(--fs-2xl)', letterSpacing: '-.02em' }}>{server.name}</h1>
              {server.mainServer === true && <Chip tone="accent" icon={Star}>{t('ui.main')}</Chip>}
            </div>
            <div class="status-line" style={{ marginTop: 4 }}>
              {ping?.state === 'done' ? (
                <>
                  <StatusDot state={ping.online ? 'on' : 'off'} />
                  {ping.online && ping.players != null
                    ? <><span class="num">{ping.players.online}/{ping.players.max} {t('ui.players')}</span>{ping.latencyMs != null && <><span>·</span><span class="num">{ping.latencyMs} ms</span></>}</>
                    : <span>{t('ui.noConnection')}</span>}
                </>
              ) : <span>…</span>}
            </div>
          </div>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>{(server.tags ?? []).map((x) => <Chip key={x}>{x}</Chip>)}</div>
        </div>
      </section>

      <div class="detail">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-section)' }}>
          <section class="prose">
            <h2>{t('ui.aboutServer')}</h2>
            {longHtml != null
              // Sanititzat amb DOMPurify just a sobre — mai HTML cru de l'admin.
              ? <div class="markdown-body" dangerouslySetInnerHTML={{ __html: longHtml }} />
              : <p>{server.description}</p>}
          </section>

          {news.length > 0 && (
            <section>
              <div class="section-title"><h2>{t('ui.serverNews')}</h2></div>
              <div class="news-list">
                {news.map((n) => (
                  <div key={n.id} class="news-row" onClick={() => void hellmc.system.openExternal(n.url)}>
                    <span class="t">{n.title}</span>
                    <span class="meta">{new Date(n.date).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })}</span>
                  </div>
                ))}
              </div>
            </section>
          )}
        </div>

        <aside class="aside">
          <div class="card pad" style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
            <div class="field-row"><label>{t('serverDetail.version')}</label>{versionSelect}</div>
            {status != null && (
              <div class="status-line">
                {status.installed
                  ? status.needsUpdate ? <Chip tone="warn">{t('versions.updateAvailable')}</Chip> : <Chip tone="ok" icon={Check}>{t('versions.installed')}</Chip>
                  : <Chip>{t('versions.notInstalled')}</Chip>}
                {current != null && <span>{t('ui.revision')} {current.version}</span>}
              </div>
            )}
            <Button variant="primary" size="lg" block class="hide-compact" disabled={versionId == null} onClick={() => void handlePlay()}>
              <Play size={20} fill="currentColor" /> {t('home.play')}
            </Button>
            <div class="copy">
              <span>{server.address}</span>
              <button type="button" class="icon-btn" title={t('ui.copyAddress')} aria-label={t('ui.copyAddress')} onClick={() => void copyAddress()}>
                {copied ? <Check size={18} /> : <Copy size={18} />}
              </button>
            </div>
            {versionId != null && (
              <a class="btn sm ghost" href={`#/versions/${versionId}`}><ExternalLink size={16} /> {t('ui.versionSettings')}</a>
            )}
          </div>
          {current != null && (
            <div class="card pad">
              <div class="kv"><span>Minecraft</span><span>{current.minecraftVersion}</span></div>
              <div class="kv"><span>Loader</span><span>{current.loader}{current.loaderVersion != null ? ` ${current.loaderVersion}` : ''}</span></div>
              {status != null && <div class="kv"><span>{t('ui.diskSize')}</span><span>{formatBytes(status.sizeBytes)}</span></div>}
              <div class="kv"><span>{t('ui.versionsAvailable')}</span><span>{server.versions.length}</span></div>
            </div>
          )}
        </aside>
      </div>

      <div class="actionbar">
        <div style={{ flex: 1 }}>{versionSelect}</div>
        <Button variant="primary" disabled={versionId == null} onClick={() => void handlePlay()}><Play size={18} fill="currentColor" /> {t('home.play')}</Button>
      </div>
    </>
  )
}
