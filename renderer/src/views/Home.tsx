import { useEffect, useState } from 'preact/hooks'
import { ArrowLeftRight, Play, RefreshCw, X } from 'lucide-preact'
import { t } from '../i18n'
import { Button } from '../components/Button'
import { Card } from '../components/Card'
import { ConfirmDialog } from '../components/ConfirmDialog'
import { Art, Chip, Progress, ServerIcon, StatusDot } from '../components/ui'
import { navigate } from '../router'
import { distro } from '../stores/distro'
import { effectiveSelection, selectVersion } from '../stores/selection'
import { selectedAccount } from '../stores/account'
import { launch, cancelLaunch, launchProgress, isLaunching } from '../stores/launch'
import { online } from '../stores/network'
import { items as newsItems, loadArchive, loading as newsLoading, sources } from '../stores/news'
import { pings, pingServer } from '../stores/status'
import { statuses, refreshStatus } from '../stores/versions'

function formatDate(ts: number): string {
  return new Date(ts).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })
}

/** 07 §2: columna de notícies (destacada + graella + llista) a l'esquerra, targeta Jugar a la dreta. */
function NewsColumn() {
  const [source, setSource] = useState('all')
  const all = newsItems.value.filter((i) => source === 'all' || i.source.id === source)
  const [featured, ...rest] = all
  const grid = rest.slice(0, 3)
  const list = rest.slice(3, 6)

  return (
    <section aria-labelledby="news-h" style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-5)' }}>
      <div class="section-title" style={{ margin: 0 }}>
        <h1 id="news-h">{t('news.title')}</h1>
        <span class="spacer" />
        {sources.value.length > 1 && (
          <select class="field sm" aria-label={t('news.title')} value={source} onChange={(e) => setSource((e.target as HTMLSelectElement).value)}>
            <option value="all">{t('news.filterAll')}</option>
            {sources.value.map((s) => <option key={s.id} value={s.id}>{s.name ?? t('news.global')}</option>)}
          </select>
        )}
        <button type="button" class="icon-btn" title={t('news.refresh')} aria-label={t('news.refresh')} disabled={newsLoading.value} onClick={() => void loadArchive()}>
          <RefreshCw size={18} />
        </button>
      </div>

      {featured == null ? (
        <Card pad><p class="muted">{newsLoading.value ? t('news.loading') : t('news.empty')}</p></Card>
      ) : (
        <>
          <article class="card news-featured" onClick={() => navigate('/news')}>
            <Art seed={featured.id} />
            <div class="body">
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <Chip tone="accent">{t('ui.featured')}</Chip>
                <span class="meta">{formatDate(featured.date)} · {featured.source.name ?? t('news.global')}</span>
              </div>
              <h2>{featured.title}</h2>
              {featured.summary != null && <p class="muted">{featured.summary}</p>}
            </div>
          </article>

          {grid.length > 0 && (
            <div class="news-grid">
              {grid.map((n) => (
                <article key={n.id} class="card news-card" onClick={() => navigate('/news')}>
                  <Art seed={n.id} />
                  <div class="body"><span class="meta">{formatDate(n.date)}</span><h3>{n.title}</h3></div>
                </article>
              ))}
            </div>
          )}

          {list.length > 0 && (
            <div class="news-list">
              {list.map((n) => (
                <div key={n.id} class="news-row" onClick={() => navigate('/news')}>
                  <span class="t">{n.title}</span><span class="meta">{formatDate(n.date)}</span>
                </div>
              ))}
            </div>
          )}
          <a class="small" href="#/news">{t('ui.viewAllNews')}</a>
        </>
      )}
    </section>
  )
}

function PlayCard() {
  const selection = effectiveSelection.value
  const d = distro.value
  const progress = launchProgress.value
  const account = selectedAccount.value
  const busy = isLaunching.value

  const server = selection.serverId != null ? d?.servers.find((s) => s.id === selection.serverId) ?? null : null
  const version = selection.versionId != null ? d?.versions.find((v) => v.id === selection.versionId) ?? null : null
  const ping = server != null ? pings.value[server.id] : undefined

  const [dismissed, setDismissed] = useState<unknown>(null)
  const errorCode = progress.phase === 'error' ? progress.error?.code : undefined
  const showDialog = (errorCode === 'AUTH_INVALID' || errorCode === 'NEEDS_NETWORK') && dismissed !== progress

  useEffect(() => {
    if (server != null) void pingServer(server.id, server.address)
  }, [server?.id])

  // 07 §2.2: l'etiqueta del botó depèn de l'estat d'instal·lació de la versió triada.
  useEffect(() => {
    if (selection.versionId != null) void refreshStatus(selection.versionId)
  }, [selection.versionId, busy])
  const versionStatus = selection.versionId != null ? statuses.value[selection.versionId] : undefined
  const playLabel = progress.phase === 'error' && !busy ? t('home.retry')
    : versionStatus != null && !versionStatus.installed ? t('ui.installAndPlay')
    : versionStatus?.needsUpdate === true ? t('ui.updateAndPlay')
    : t('home.play')

  // Versions entre les quals triar: les del servidor seleccionat o, sense servidor, totes.
  const options = server != null
    ? server.versions
        .map((e) => ({ id: e.id, recommended: e.recommended === true, version: d?.versions.find((v) => v.id === e.id) }))
        .filter((o) => o.version != null)
    : (d?.versions ?? []).map((v) => ({ id: v.id, recommended: false, version: v }))

  async function handlePlay() {
    if (selection.versionId == null) return
    await launch({ serverId: selection.serverId, versionId: selection.versionId })
  }

  const phaseLabel = t(`home.phase.${progress.phase}`)
  const name = server?.name ?? t('home.noServer')

  return (
    <aside class={`card playcard${busy ? ' busy' : ''}`} aria-label={t('home.play')}>
      <Art seed={server?.id ?? 'free'} url={server?.banner} />
      <div class="body">
        <div class="pc-head">
          <ServerIcon name={name} seed={server?.id ?? 'free'} url={server?.icon} />
          <div class="txt">
            <h3>{name}</h3>
            <div class="status-line">
              {server != null && ping?.state === 'done' ? (
                <>
                  <StatusDot state={ping.online ? 'on' : 'off'} />
                  {ping.online && ping.players != null
                    ? <><span class="num">{ping.players.online}/{ping.players.max}</span>{ping.latencyMs != null && <><span>·</span><span class="num">{ping.latencyMs} ms</span></>}</>
                    : <span>{t('ui.noConnection')}</span>}
                </>
              ) : (
                <span>{account != null ? t('home.playingAs', { name: account.displayName }) : ''}</span>
              )}
            </div>
          </div>
        </div>

        <div class="field-row">
          <label for="pc-version">{t('serverDetail.version')}</label>
          <select id="pc-version" class="field" disabled={busy || options.length === 0} value={selection.versionId ?? ''}
            onChange={(e) => void selectVersion((e.target as HTMLSelectElement).value)}>
            {options.length === 0 && <option value="">{t('home.noVersionAvailable')}</option>}
            {options.map((o) => (
              <option key={o.id} value={o.id}>{o.version!.name}{o.recommended ? ` · ${t('serverDetail.recommended')}` : ''}</option>
            ))}
          </select>
        </div>

        {account?.type === 'offline' && <p class="xs" style={{ color: 'var(--warning)' }}>{t('home.offlineAccountWarning')}</p>}
        {account?.type === 'microsoft' && !online.value && <p class="xs" style={{ color: 'var(--warning)' }}>{t('home.microsoftOffline')}</p>}

        <div class="pc-progress" aria-live="polite">
          <div class="row"><span>{phaseLabel}</span><span class="num">{progress.percent > 0 ? `${Math.round(progress.percent)}%` : ''}</span></div>
          <Progress value={progress.percent > 0 ? progress.percent : null} />
        </div>

        {progress.phase === 'error' && progress.error != null && !showDialog && <p class="error-text">{progress.error.message}</p>}

        <div class="pc-actions">
          {busy ? (
            <Button variant="secondary" size="lg" block onClick={() => void cancelLaunch()}><X size={20} /> {t('home.cancel')}</Button>
          ) : (
            <Button variant="primary" size="lg" block disabled={version == null} onClick={() => void handlePlay()}>
              <Play size={20} fill="currentColor" /> {playLabel}
            </Button>
          )}
          <a class="btn ghost sm block" href="#/servers"><ArrowLeftRight size={16} /> {t('ui.changeServer')}</a>
        </div>
      </div>

      {showDialog && errorCode === 'AUTH_INVALID' && (
        <ConfirmDialog title={t('home.authInvalidTitle')} message={t('home.authInvalidBody')} confirmLabel={t('home.authInvalidAction')}
          cancelLabel={t('home.close')} danger={false} onCancel={() => setDismissed(progress)}
          onConfirm={() => { setDismissed(progress); navigate('/settings/account') }} />
      )}
      {showDialog && errorCode === 'NEEDS_NETWORK' && (
        <ConfirmDialog title={t('home.needNetworkTitle')} message={t('home.needNetworkBody')} confirmLabel={t('home.retry')}
          cancelLabel={t('home.close')} danger={false} onCancel={() => setDismissed(progress)}
          onConfirm={() => { setDismissed(progress); void handlePlay() }} />
      )}
    </aside>
  )
}

export function Home() {
  return (
    <div class="home">
      <NewsColumn />
      <PlayCard />
    </div>
  )
}
