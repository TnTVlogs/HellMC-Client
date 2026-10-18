import { useEffect, useState } from 'preact/hooks'
import { ArrowLeftRight, Copy, MoreHorizontal, Play, RefreshCw, Settings2, X } from 'lucide-preact'
import { t } from '../i18n'
import { Button } from '../components/Button'
import { Card } from '../components/Card'
import { ConfirmDialog } from '../components/ConfirmDialog'
import { IconButton } from '../components/IconButton'
import { Popover } from '../components/Popover'
import { Select } from '../components/Select'
import { Skeleton, SkeletonGroup, SkeletonText } from '../components/Skeleton'
import { Art, Chip, Progress, ServerIcon, StatusDot } from '../components/ui'
import { hellmc } from '../api'
import { navigate } from '../router'
import { distro } from '../stores/distro'
import { effectiveSelection, selectServer, selectVersion } from '../stores/selection'
import { selectedAccount } from '../stores/account'
import { launch, cancelLaunch, launchProgress, isLaunching } from '../stores/launch'
import { online } from '../stores/network'
import { items as newsItems, loadArchive, loading as newsLoading, sources } from '../stores/news'
import { pings, watchPing } from '../stores/status'
import { statuses, refreshStatus } from '../stores/versions'
import { copyWithToast } from '../utils/clipboard'
import { formatDuration } from '../utils/format'

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
          <Select size="sm" ariaLabel={t('news.title')} value={source} onChange={setSource}
            options={[{ value: 'all', label: t('news.filterAll') }, ...sources.value.map((s) => ({ value: s.id, label: s.name ?? t('news.global') }))]} />
        )}
        <IconButton label={t('news.refresh')} disabled={newsLoading.value} onClick={() => void loadArchive()}>
          <RefreshCw size={18} />
        </IconButton>
      </div>

      {featured == null ? (
        newsLoading.value ? (
          <SkeletonGroup label={t('news.loading')} style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
            <Card pad><Skeleton height={140} radius={8} style={{ marginBottom: 12 }} /><Skeleton width="45%" height={20} style={{ marginBottom: 10 }} /><SkeletonText lines={2} /></Card>
            <div class="news-grid">{[0, 1, 2].map((i) => <Card key={i} pad><Skeleton height={70} radius={8} style={{ marginBottom: 10 }} /><SkeletonText lines={2} /></Card>)}</div>
          </SkeletonGroup>
        ) : (
          <Card pad><p class="muted">{t('news.empty')}</p></Card>
        )
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

/** Text de l'error de llançament en l'idioma actiu (el missatge del procés principal és en anglès, només per al registre). */
function errorText(code: string | undefined, fallback: string, exitCode?: number): string {
  const key = `home.errors.${code ?? ''}`
  const translated = t(key, { code: exitCode ?? '' })
  return translated === key ? fallback : translated
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

  // Ping del servidor triat: ara, cada minut i en tornar a la pestanya (només visible, 06 §10).
  useEffect(() => {
    if (server == null) return
    return watchPing(server.id, server.address)
  }, [server?.id, server?.address])

  // Menú «⋯»: l'ancora és el botó que l'ha obert (null = tancat).
  const [menuAnchor, setMenuAnchor] = useState<HTMLElement | null>(null)
  const closeMenu = () => setMenuAnchor(null)

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
          <ServerIcon name={server?.name ?? version?.name ?? name} seed={server?.id ?? version?.id ?? 'free'} url={server != null ? server.icon : version?.icon} />
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
          <Select id="pc-version" disabled={busy || options.length === 0} value={selection.versionId ?? ''}
            placeholder={t('home.noVersionAvailable')} onChange={(v) => void selectVersion(v)}
            options={options.map((o) => ({ value: o.id, label: `${o.version!.name}${o.recommended ? ` · ${t('serverDetail.recommended')}` : ''}` }))} />
        </div>

        {account?.type === 'offline' && <p class="xs" style={{ color: 'var(--warning)' }}>{t('home.offlineAccountWarning')}</p>}
        {account?.type === 'microsoft' && !online.value && <p class="xs" style={{ color: 'var(--warning)' }}>{t('home.microsoftOffline')}</p>}

        <div class="pc-progress" aria-live="polite">
          <div class="row"><span>{phaseLabel}</span><span class="num">{progress.percent > 0 ? `${Math.round(progress.percent)}%` : ''}</span></div>
          <Progress value={progress.percent > 0 ? progress.percent : null} />
          {progress.phase === 'downloading' && progress.etaSeconds != null && (
            <span class="eta num">{t('home.eta', { time: formatDuration(progress.etaSeconds) })}</span>
          )}
        </div>

        {progress.phase === 'error' && progress.error != null && !showDialog && (
          <div>
            <p class="error-text">{errorText(progress.error.code, progress.error.message, progress.error.exitCode)}</p>
            {progress.error.details != null && progress.error.details.length > 0 && (
              <details class="xs" style={{ marginTop: 4 }}>
                <summary>{t('settings.about.viewLogs')}</summary>
                <pre class="num" style={{ whiteSpace: 'pre-wrap', maxHeight: 160, overflow: 'auto', margin: 0 }}>{progress.error.details.join('\n')}</pre>
              </details>
            )}
            {progress.error.code === 'GAME_EXITED' && (
              <button type="button" class="link-btn" onClick={() => void hellmc.system.openLogsFolder()}>{t('settings.about.openLogs')}</button>
            )}
          </div>
        )}

        <div class="pc-actions">
          {busy ? (
            <Button variant="secondary" size="lg" block onClick={() => void cancelLaunch()}><X size={20} /> {t('home.cancel')}</Button>
          ) : (
            <Button variant="primary" size="lg" block disabled={version == null} onClick={() => void handlePlay()}>
              <Play size={20} fill="currentColor" /> {playLabel}
            </Button>
          )}
          <div class="pc-more">
            <a class="btn ghost sm block" href="#/servers"><ArrowLeftRight size={16} /> {t('ui.changeServer')}</a>
            <IconButton label={t('home.more')} aria-haspopup="menu" aria-expanded={menuAnchor != null}
              onClick={(e) => setMenuAnchor(menuAnchor != null ? null : e.currentTarget)}>
              <MoreHorizontal size={18} />
            </IconButton>
          </div>
        </div>
        {menuAnchor != null && (
          <Popover anchor={menuAnchor} onClose={closeMenu} width={260}>
            <div class="menu-list">
              <button type="button" role="menuitem" class="menu-item" disabled={version == null}
                onClick={() => { closeMenu(); if (version != null) navigate(`/versions/${version.id}`) }}>
                <Settings2 size={16} /> {t('home.menuSettings')}
              </button>
              <button type="button" role="menuitem" class="menu-item" disabled={server == null}
                onClick={() => { closeMenu(); if (server != null) void copyWithToast(server.address) }}>
                <Copy size={16} /> {t('home.menuCopyAddress')}
              </button>
              <button type="button" role="menuitem" class="menu-item" disabled={busy || server == null}
                onClick={() => { closeMenu(); void selectServer(null) }}>
                <Play size={16} /> {t('home.menuNoServer')}
              </button>
            </div>
          </Popover>
        )}
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
