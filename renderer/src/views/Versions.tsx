import { useEffect, useState } from 'preact/hooks'
import { Check, Download, Play, RefreshCw, Search } from 'lucide-preact'
import { t } from '../i18n'
import { Button } from '../components/Button'
import { Card } from '../components/Card'
import { Chip, Progress, ServerIcon } from '../components/ui'
import { navigate } from '../router'
import { distro, distroLoading } from '../stores/distro'
import { selectServer, selectVersion } from '../stores/selection'
import { launch } from '../stores/launch'
import { statuses, refreshStatus, install, progress, busy } from '../stores/versions'
import { formatBytes } from '../utils/format'

// 07 §4.1: taula de versions (targetes apilades en compacte, 08 §6.3), cerca, filtre i accions per
// fila. Estructura i classes del prototip.

type Filter = 'all' | 'installed' | 'updates'

export function Versions() {
  const d = distro.value
  const [query, setQuery] = useState('')
  const [filter, setFilter] = useState<Filter>('all')

  useEffect(() => {
    if (d == null) return
    for (const version of d.versions) void refreshStatus(version.id)
  }, [d])

  const rows = (d?.versions ?? [])
    .filter((v) => v.name.toLowerCase().includes(query.trim().toLowerCase()))
    .filter((v) => {
      const s = statuses.value[v.id]
      if (filter === 'installed') return s?.installed === true
      if (filter === 'updates') return s?.needsUpdate === true
      return true
    })

  const updatable = (d?.versions ?? []).filter((v) => statuses.value[v.id]?.needsUpdate === true)

  async function play(versionId: string) {
    await selectServer(null)
    await selectVersion(versionId)
    navigate('/home')
    await launch({ serverId: null, versionId })
  }

  return (
    <>
      <div class="page-head">
        <div class="grow"><h1>{t('nav.versions')}</h1><p>{t('ui.versionsSubtitle')}</p></div>
        <div class="search">
          <Search size={18} />
          <input class="field" placeholder={t('ui.searchVersion')} aria-label={t('ui.search')} value={query}
            onInput={(e) => setQuery((e.target as HTMLInputElement).value)} />
        </div>
      </div>

      <div class="filters" role="group" aria-label={t('ui.filter')}>
        <button type="button" class="chip" aria-pressed={filter === 'all'} onClick={() => setFilter('all')}>{t('ui.allF')}</button>
        <button type="button" class="chip" aria-pressed={filter === 'installed'} onClick={() => setFilter('installed')}>{t('ui.installedF')}</button>
        <button type="button" class="chip" aria-pressed={filter === 'updates'} onClick={() => setFilter('updates')}>{t('ui.withUpdate')}</button>
        <span style={{ flex: 1 }} />
        <Button size="sm" disabled={updatable.length === 0} onClick={() => updatable.forEach((v) => void install(v.id))}>
          <RefreshCw size={16} /> {t('ui.updateAll')}
        </Button>
      </div>

      {distroLoading.value && <p class="muted">{t('home.loadingDistro')}</p>}
      {d != null && d.versions.length === 0 && !distroLoading.value && <p class="muted">{t('versions.empty')}</p>}

      <Card class="vtable" aria-label={t('nav.versions')}>
        <div class="vrow head">
          <span>{t('serverDetail.version')}</span><span>{t('ui.mcLoader')}</span><span>{t('ui.revision')}</span>
          <span>{t('ui.state')}</span><span>{t('ui.size')}</span><span />
        </div>
        {rows.map((version) => {
          const status = statuses.value[version.id]
          const isBusy = busy.value[version.id] === true
          const pct = progress.value[version.id]?.percent
          const servers = (d?.servers ?? []).filter((s) => s.versions.some((e) => e.id === version.id))
          return (
            <div key={version.id} class="vrow">
              <div class="name" style={{ display: 'flex', gap: 'var(--space-3)', alignItems: 'center', minWidth: 0 }}>
                <ServerIcon name={version.name} seed={version.id} url={version.icon} class="vicon" />
                <div style={{ minWidth: 0 }}>
                  <b>{version.name}</b>
                  <div class="xs-chips">
                    {servers.length === 0
                      ? <Chip>{t('ui.noServer')}</Chip>
                      : servers.map((s, i) => <Chip key={s.id} tone={i === 0 ? 'accent' : undefined}>{s.name}</Chip>)}
                  </div>
                </div>
              </div>
              <div class="mc muted small">{version.minecraftVersion} · {version.loader}{version.loaderVersion ? ` ${version.loaderVersion}` : ''}</div>
              <div class="rev num">{version.version}</div>
              <div class="st">
                {isBusy ? (
                  <>
                    <Chip tone="info" icon={Download}>{t('ui.working')}{pct != null && pct > 0 ? ` ${Math.round(pct)}%` : ''}</Chip>
                    <Progress value={pct != null && pct > 0 ? pct : null} />
                  </>
                ) : status == null ? <Chip>…</Chip>
                  : status.installed
                    ? status.needsUpdate ? <Chip tone="warn" icon={RefreshCw}>{t('versions.updateAvailable')}</Chip> : <Chip tone="ok" icon={Check}>{t('versions.installed')}</Chip>
                    : <Chip>{t('versions.notInstalled')}</Chip>}
              </div>
              <div class="size num muted">{status?.installed ? formatBytes(status.sizeBytes) : '—'}</div>
              <div class="acts">
                <a class="btn sm" href={`#/versions/${version.id}`}>{t('ui.details')}</a>
                {status?.installed && !status.needsUpdate && !isBusy && (
                  <Button size="sm" variant="primary" onClick={() => void play(version.id)}><Play size={16} fill="currentColor" /> {t('home.play')}</Button>
                )}
                {status?.installed && status.needsUpdate && !isBusy && (
                  <Button size="sm" onClick={() => void install(version.id)}>{t('ui.update')}</Button>
                )}
                {status != null && !status.installed && !isBusy && (
                  <Button size="sm" onClick={() => void install(version.id)}><Download size={16} /> {t('versions.install')}</Button>
                )}
              </div>
            </div>
          )
        })}
      </Card>
    </>
  )
}
