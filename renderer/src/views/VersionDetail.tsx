import { useEffect, useMemo, useState } from 'preact/hooks'
import { marked } from 'marked'
import DOMPurify from 'dompurify'
import { Box, Check, ExternalLink, Info, Lock, Play, Search, ShieldCheck, Trash2, Download } from 'lucide-preact'
import { t } from '../i18n'
import { Button } from '../components/Button'
import { Card } from '../components/Card'
import { Tabs } from '../components/Tabs'
import { ConfirmDialog } from '../components/ConfirmDialog'
import { Toggle } from '../components/Toggle'
import { Banner, Chip, Progress } from '../components/ui'
import { navigate } from '../router'
import { distro } from '../stores/distro'
import { selectServer, selectVersion } from '../stores/selection'
import { launch } from '../stores/launch'
import { statuses, progress, busy, refreshStatus, install, verify, uninstall } from '../stores/versions'
import { hellmc, type VersionSettings, type JavaInfo, type JavaDownloadProgress, type DataSharingPreference, type ModInfo } from '../api'
import { formatBytes } from '../utils/format'
import { build as buildModGroup, type ModGroupState } from '../utils/modgroups'

// 07 §4.2: pestanyes Resum + Mods + Java/memòria + Fitxers. Marcat i classes del prototip.

function FilesTab({ versionId }: { versionId: string }) {
  const status = statuses.value[versionId]
  if (status == null) return <p class="muted">{t('home.loadingDistro')}</p>
  return (
    <Card>
      <div class="set-row">
        <div class="l">
          <b>{t('versionDetail.files.path')}</b>
          <span class="num" style={{ wordBreak: 'break-all' }}>{status.path}</span>
          {!status.installed && <span style={{ display: 'block' }}>{t('versionDetail.files.notInstalled')}</span>}
        </div>
        <Button size="sm" disabled={!status.installed} onClick={() => void hellmc.system.openPath(status.path)}>
          <ExternalLink size={16} /> {t('versionDetail.files.openFolder')}
        </Button>
      </div>
      {status.installed && (
        <div class="set-row"><div class="l"><b>{t('versionDetail.files.size')}</b><span>{formatBytes(status.sizeBytes)}</span></div></div>
      )}
    </Card>
  )
}

// `ready` es mostra només l'instant entre extreure i que `handleDownload` netegi l'estat.
const DOWNLOAD_PHASE_KEYS: Record<JavaDownloadProgress['phase'], string> = {
  'fetching-jdk': 'versionDetail.java.phase.fetchingJdk',
  'downloading-java': 'versionDetail.java.phase.downloadingJava',
  'extracting-java': 'versionDetail.java.phase.extractingJava',
  ready: 'versionDetail.java.phase.extractingJava'
}

/** `"2G"`/`"2048M"` → GB (enter, mínim 1). */
function toGb(value: string): number {
  const m = /^(\d+(?:\.\d+)?)\s*([GMgm])?/.exec(value.trim())
  if (m == null) return 1
  const n = Number.parseFloat(m[1])
  return Math.max(1, Math.round(m[2]?.toUpperCase() === 'M' ? n / 1024 : n))
}

function JavaMemoryTab({ versionId }: { versionId: string }) {
  const [settings, setSettings] = useState<VersionSettings | null>(null)
  const [javaInfo, setJavaInfo] = useState<JavaInfo | null>(null)
  const [detecting, setDetecting] = useState(false)
  const [downloading, setDownloading] = useState(false)
  const [downloadProgress, setDownloadProgress] = useState<JavaDownloadProgress | null>(null)
  const [downloadFailed, setDownloadFailed] = useState(false)
  const [totalGb, setTotalGb] = useState(16)
  const [jvm, setJvm] = useState('')
  const [minGb, setMinGb] = useState(1)
  const [maxGb, setMaxGb] = useState(2)

  useEffect(() => {
    void hellmc.config.getVersion(versionId).then((s) => {
      setSettings(s)
      setJvm(s.jvmOptions.join(' '))
      setMinGb(toGb(s.minRAM))
      setMaxGb(toGb(s.maxRAM))
    })
    void hellmc.system.memory().then((m) => setTotalGb(Math.max(2, Math.floor(m.totalMb / 1024))))
  }, [versionId])

  // Progrés en viu de `hellmc:java-download-progress`, filtrat per `versionId`.
  useEffect(() => {
    return hellmc.java.onDownloadProgress((vId, p) => {
      if (vId === versionId) setDownloadProgress(p)
    })
  }, [versionId])

  async function reload() {
    setSettings(await hellmc.config.getVersion(versionId))
  }

  async function handleDetect() {
    setDetecting(true)
    try {
      const info = await hellmc.java.detect(versionId)
      setJavaInfo(info)
      if (info.available) await reload()
    } finally {
      setDetecting(false)
    }
  }

  async function handlePick() {
    const picked = await hellmc.java.pick()
    if (picked == null) return
    await hellmc.config.setVersion(versionId, { executable: picked })
    await reload()
  }

  // Només ofert un cop `detect` ja ha confirmat que no n'hi ha cap de compatible.
  async function handleDownload() {
    setDownloading(true)
    setDownloadFailed(false)
    setDownloadProgress({ phase: 'fetching-jdk', percent: 0 })
    try {
      const info = await hellmc.java.download(versionId)
      setJavaInfo(info)
      await reload()
    } catch {
      setDownloadFailed(true)
    } finally {
      setDownloading(false)
      setDownloadProgress(null)
    }
  }

  async function commitRam(field: 'minRAM' | 'maxRAM', gb: number) {
    await hellmc.config.setVersion(versionId, { [field]: `${gb}G` })
    await reload()
  }

  async function commitJvm() {
    await hellmc.config.setVersion(versionId, { jvmOptions: jvm.split(/\s+/).filter(Boolean) })
    await reload()
  }

  if (settings == null) return <p class="muted">{t('home.loadingDistro')}</p>

  return (
    <div class="card pad spanel" style={{ maxWidth: 'none' }}>
      <div class="slider-row">
        <label for="ram-min">{t('versionDetail.java.minRam')}</label>
        <input id="ram-min" type="range" min={1} max={totalGb} value={minGb}
          onInput={(e) => { const v = Number((e.target as HTMLInputElement).value); setMinGb(v); if (v > maxGb) setMaxGb(v) }}
          onChange={() => { void commitRam('minRAM', minGb); if (minGb > maxGb) void commitRam('maxRAM', minGb) }} />
        <span class="num">{minGb} GB</span>
      </div>
      <div class="slider-row">
        <label for="ram-max">{t('versionDetail.java.maxRam')}</label>
        <input id="ram-max" type="range" min={1} max={totalGb} value={maxGb}
          onInput={(e) => { const v = Number((e.target as HTMLInputElement).value); setMaxGb(v); if (v < minGb) setMinGb(v) }}
          onChange={() => { void commitRam('maxRAM', maxGb); if (maxGb < minGb) void commitRam('minRAM', maxGb) }} />
        <span class="num">{maxGb} GB</span>
      </div>

      <div class="set-row" style={{ paddingInline: 0 }}>
        <div class="l">
          <b>{t('versionDetail.java.executable')}</b>
          <span style={{ wordBreak: 'break-all' }}>{settings.executable ?? t('versionDetail.java.notConfigured')}</span>
          {javaInfo != null && !javaInfo.available && <span style={{ display: 'block', color: 'var(--danger)' }}>{t('versionDetail.java.noneFound')}</span>}
          {downloadFailed && <span style={{ display: 'block', color: 'var(--danger)' }}>{t('versionDetail.java.downloadFailed')}</span>}
        </div>
        <div style={{ display: 'flex', gap: 'var(--space-2)', flexWrap: 'wrap', justifyContent: 'flex-end' }}>
          <Button size="sm" disabled={detecting || downloading} onClick={() => void handleDetect()}>
            {detecting ? t('versionDetail.java.detecting') : t('versionDetail.java.autoDetect')}
          </Button>
          <Button size="sm" variant="ghost" disabled={downloading} onClick={() => void handlePick()}>{t('versionDetail.java.chooseManually')}</Button>
          {javaInfo != null && !javaInfo.available && (
            <Button size="sm" variant="primary" disabled={downloading} onClick={() => void handleDownload()}>
              <Download size={16} /> {t('versionDetail.java.downloadAuto')}
            </Button>
          )}
        </div>
      </div>
      {downloading && downloadProgress != null && (
        <div class="pc-progress on" style={{ display: 'flex' }}>
          <div class="row"><span>{t(DOWNLOAD_PHASE_KEYS[downloadProgress.phase])}</span>
            <span class="num">{downloadProgress.phase === 'downloading-java' ? `${downloadProgress.percent}%` : ''}</span></div>
          <Progress value={downloadProgress.phase === 'downloading-java' ? downloadProgress.percent : null} />
        </div>
      )}

      <div class="field-row">
        <label for="jvm-args">{t('ui.jvmArgs')}</label>
        <input id="jvm-args" class="field" value={jvm} onInput={(e) => setJvm((e.target as HTMLInputElement).value)} onBlur={() => void commitJvm()} />
      </div>
      <p class="muted small">{t('ui.ramHint', { total: totalGb })}</p>
    </div>
  )
}

// 07 §4.4 (D26): interruptor per versió. Amagat del tot si la versió és `forcedSeparate` — en el seu
// lloc un text fix explicant per què.
function DataSharingToggle({ versionId }: { versionId: string }) {
  const [pref, setPref] = useState<DataSharingPreference | null>(null)

  useEffect(() => {
    void hellmc.dataSharing.getPreference(versionId).then(setPref)
  }, [versionId])

  async function handleChange(shared: boolean) {
    await hellmc.dataSharing.setPreference(versionId, shared)
    setPref(await hellmc.dataSharing.getPreference(versionId))
  }

  if (pref == null) return null

  if (pref.forced) {
    return <p class="muted small" title={t('versionDetail.dataSharing.forcedTooltip')}>{t('versionDetail.dataSharing.forcedNotice')}</p>
  }

  return (
    <Card>
      <div class="set-row">
        <div class="l">
          <b>{t('versionDetail.dataSharing.title')}</b>
          <span>{t('versionDetail.dataSharing.help')}</span>
          <span style={{ display: 'block', color: 'var(--text-faint)' }}>{t('versionDetail.dataSharing.changeNotice')}</span>
        </div>
        <Toggle checked={pref.shared} onChange={(v) => void handleChange(v)} label={t('versionDetail.dataSharing.title')} />
      </div>
    </Card>
  )
}

// 07 §4.2 pt.2 (`docs/mod-dependency-groups`): mods opcionals com a grup. La lògica del graf
// (`utils/modgroups.ts`) és un port TS de `app/assets/js/modgroups.js`, ja en ús real
// (`ProcessBuilder.enforceModDependencies`). Llista **plana** sempre (D5).
function ModsTab({ versionId }: { versionId: string }) {
  const [mods, setMods] = useState<ModInfo[] | null>(null)
  const [state, setState] = useState<ModGroupState>(new Map())
  const [search, setSearch] = useState('')
  const [note, setNote] = useState<{ id: string; text: string } | null>(null)

  const graph = useMemo(() => (mods != null ? buildModGroup(mods.map((m) => ({ id: m.id, required: m.required, dependencies: m.dependencies }))) : null), [mods])
  const byId = useMemo(() => (mods != null ? new Map(mods.map((m) => [m.id, m])) : null), [mods])

  useEffect(() => {
    let cancelled = false
    async function load() {
      const [list, rawState] = await Promise.all([hellmc.mods.list(versionId), hellmc.mods.getState(versionId)])
      if (cancelled) return
      const initial: ModGroupState = new Map(list.filter((m) => !m.required).map((m) => [m.id, rawState[m.key] === true]))
      const g = buildModGroup(list.map((m) => ({ id: m.id, required: m.required, dependencies: m.dependencies })))
      // Coherència en obrir la pestanya (05-client.md §3.5): es força i es persisteix de seguida.
      const forced = g.normalize(initial)
      setMods(list)
      setState(initial)
      if (forced.length > 0) {
        const patch: Record<string, boolean> = {}
        for (const fid of forced) {
          const m = list.find((x) => x.id === fid)
          if (m != null) patch[m.key] = true
        }
        await hellmc.mods.setState(versionId, patch)
      }
    }
    void load()
    return () => { cancelled = true }
  }, [versionId])

  function nameList(ids: string[], max = 3): string {
    const names = ids.map((mid) => byId?.get(mid)?.name ?? mid)
    if (names.length <= max) return names.join(', ')
    return `${names.slice(0, max).join(', ')} ${t('versionDetail.mods.andMore', { count: names.length - max })}`
  }

  async function handleToggle(mod: ModInfo, checked: boolean) {
    if (graph == null || mods == null) return
    const next = new Map(state)
    const changed = checked ? graph.enable(next, mod.id) : graph.disable(next, mod.id)
    if (changed == null) return // xarxa de seguretat: l'interruptor ja hauria d'estar bloquejat
    setState(next)
    const patch: Record<string, boolean> = {}
    for (const cid of changed) {
      const m = mods.find((x) => x.id === cid)
      if (m != null) patch[m.key] = next.get(cid) === true
    }
    await hellmc.mods.setState(versionId, patch)
    const others = changed.filter((cid) => cid !== mod.id)
    setNote(others.length > 0 ? { id: mod.id, text: t(checked ? 'versionDetail.mods.alsoEnabled' : 'versionDetail.mods.alsoDisabled', { list: nameList(others) }) } : null)
  }

  if (mods == null || graph == null) return <p class="muted">{t('home.loadingDistro')}</p>
  if (mods.length === 0) return <p class="muted">{t('versionDetail.mods.empty')}</p>

  const query = search.trim().toLowerCase()
  const visible = query === '' ? mods : mods.filter((m) => m.name.toLowerCase().includes(query))
  const optional = visible.filter((m) => !m.required)
  const required = visible.filter((m) => m.required)
  const optionalCount = mods.filter((m) => !m.required).length
  const enabledCount = mods.filter((m) => !m.required && state.get(m.id) === true).length

  const row = (m: ModInfo) => {
    const enabled = m.required || state.get(m.id) === true
    const blockers = !m.required && enabled ? graph.blockers(state, m.id) : []
    const blocked = blockers.length > 0
    return (
      <div key={m.id} class="mod">
        <div class="mod-ico">{m.required ? <Lock size={16} /> : <Box size={16} />}</div>
        <div class="info">
          <b>{m.name}</b>
          {blocked && <span class="note">{t('versionDetail.mods.blocked', { list: nameList(blockers) })}</span>}
          {note?.id === m.id && !blocked && <span class="note">{note.text}</span>}
        </div>
        <Toggle checked={enabled} disabled={m.required} blocked={blocked} onChange={(v) => { if (!blocked) void handleToggle(m, v) }} label={m.name}
          title={blocked ? t('versionDetail.mods.blocked', { list: nameList(blockers) }) : undefined} />
      </div>
    )
  }

  return (
    <>
      <Banner tone="info" icon={Info}>{t('ui.modsHint')}</Banner>
      <div class="section-title" style={{ marginTop: 'var(--space-4)' }}>
        <h2>{t('ui.optional')}</h2>
        {optionalCount > 0 && <span class="muted small">{t('versionDetail.mods.count', { enabled: enabledCount, total: optionalCount })}</span>}
        <span class="spacer" />
        <div class="search"><Search size={18} />
          <input class="field" placeholder={t('versionDetail.mods.search')} aria-label={t('versionDetail.mods.search')} value={search}
            onInput={(e) => setSearch((e.target as HTMLInputElement).value)} />
        </div>
      </div>
      {optional.length > 0 && <Card>{optional.map(row)}</Card>}
      {required.length > 0 && (
        <>
          <div class="section-title" style={{ marginTop: 'var(--space-6)' }}><h2>{t('ui.requiredMods')}</h2><span class="muted small">{t('ui.alwaysOn')}</span></div>
          <Card>{required.map(row)}</Card>
        </>
      )}
    </>
  )
}

export function VersionDetail({ id }: { id: string }) {
  const d = distro.value
  const version = d?.versions.find((v) => v.id === id) ?? null
  const [tab, setTab] = useState('summary')
  const [confirmingUninstall, setConfirmingUninstall] = useState(false)

  useEffect(() => {
    void refreshStatus(id)
  }, [id])

  if (d == null) return <p class="muted">{t('home.loadingDistro')}</p>
  if (version == null) {
    return (
      <Card pad>
        <p class="muted">{t('versionDetail.notFound')}</p>
        <Button style={{ marginTop: 'var(--space-3)' }} onClick={() => navigate('/versions')}>{t('versionDetail.back')}</Button>
      </Card>
    )
  }

  const status = statuses.value[id]
  const taskProgress = progress.value[id]
  const isBusy = busy.value[id] === true
  const availableServers = d.servers.filter((s) => s.versions.some((v) => v.id === id))
  // Sanititzat amb DOMPurify abans de pintar (07 §4.2) — mai HTML cru sense passar-hi.
  const changelogHtml = version.changelog != null ? DOMPurify.sanitize(marked.parse(version.changelog, { async: false })) : null

  async function handlePlayWithoutServer() {
    await selectServer(null)
    await selectVersion(id)
    navigate('/home')
    await launch({ serverId: null, versionId: id })
  }

  return (
    <>
      <div><a class="small" href="#/versions">← {t('nav.versions')}</a></div>
      <div class="page-head">
        <div class="grow">
          <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
            <h1>{version.name}</h1>
            {status?.installed === true && (status.needsUpdate ? <Chip tone="warn">{t('versions.updateAvailable')}</Chip> : <Chip tone="ok" icon={Check}>{t('versions.installed')}</Chip>)}
            {status != null && !status.installed && <Chip>{t('versions.notInstalled')}</Chip>}
          </div>
          <p>
            Minecraft {version.minecraftVersion} · {version.loader}{version.loaderVersion ? ` ${version.loaderVersion}` : ''} · {t('ui.revision')} {version.version}
            {status?.installed === true ? ` · ${formatBytes(status.sizeBytes)}` : ''}
          </p>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {status?.installed !== true && (
            <Button variant="primary" disabled={isBusy} onClick={() => void install(id)}><Download size={18} /> {t('versions.install')}</Button>
          )}
          {status?.installed === true && (
            <>
              <Button disabled={isBusy} onClick={() => void verify(id)}><ShieldCheck size={18} /> {t('versionDetail.verify')}</Button>
              <Button variant="danger" disabled={isBusy} onClick={() => setConfirmingUninstall(true)}><Trash2 size={18} /> {t('versionDetail.uninstall')}</Button>
              <Button variant="primary" disabled={isBusy} onClick={() => void handlePlayWithoutServer()}><Play size={18} fill="currentColor" /> {t('ui.playWithoutServer')}</Button>
            </>
          )}
        </div>
      </div>

      {isBusy && (
        <Card pad>
          <div class="pc-progress on" style={{ display: 'flex' }}>
            <div class="row">
              <span>{taskProgress?.message != null ? t(`home.phase.${taskProgress.message}`) : t('ui.working')}</span>
              <span class="num">{taskProgress != null && taskProgress.percent > 0 ? `${Math.round(taskProgress.percent)}%` : ''}</span>
            </div>
            <Progress value={taskProgress != null && taskProgress.percent > 0 ? taskProgress.percent : null} />
          </div>
        </Card>
      )}

      <Tabs
        active={tab}
        onChange={setTab}
        items={[
          { id: 'summary', label: t('versionDetail.tabs.summary') },
          { id: 'mods', label: t('versionDetail.tabs.mods') },
          { id: 'java', label: t('versionDetail.tabs.java') },
          { id: 'files', label: t('versionDetail.tabs.files') }
        ]}
      />

      {tab === 'summary' && (
        <div class="detail">
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-section)' }}>
            <div class="prose">
              <p>{version.description}</p>
              {changelogHtml != null && (
                <>
                  <h2>{t('versionDetail.changelog')}</h2>
                  <div class="markdown-body" dangerouslySetInnerHTML={{ __html: changelogHtml }} />
                </>
              )}
            </div>
            <DataSharingToggle versionId={id} />
          </div>
          <aside class="aside">
            {availableServers.length > 0 && (
              <div class="card pad">
                <h3 style={{ marginBottom: 'var(--space-3)' }}>{t('ui.availableAt')}</h3>
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                  {availableServers.map((s, i) => (
                    <button key={s.id} type="button" class={`chip${i === 0 ? ' accent' : ''}`} onClick={() => navigate(`/servers/${s.id}`)}>{s.name}</button>
                  ))}
                </div>
              </div>
            )}
            <div class="card pad">
              <div class="kv"><span>Minecraft</span><span>{version.minecraftVersion}</span></div>
              <div class="kv"><span>Loader</span><span>{version.loader}{version.loaderVersion ? ` ${version.loaderVersion}` : ''}</span></div>
              {version.javaOptions?.suggestedMajor != null && <div class="kv"><span>{t('ui.suggestedJava')}</span><span>{version.javaOptions.suggestedMajor}</span></div>}
              {status != null && (
                <div class="kv"><span>{t('ui.folder')}</span>
                  <a href="#" onClick={(e) => { e.preventDefault(); if (status.installed) void hellmc.system.openPath(status.path) }}>{t('ui.open')}</a>
                </div>
              )}
            </div>
          </aside>
        </div>
      )}

      {tab === 'mods' && <ModsTab versionId={id} />}
      {tab === 'java' && <JavaMemoryTab versionId={id} />}
      {tab === 'files' && <FilesTab versionId={id} />}

      {confirmingUninstall && (
        <ConfirmDialog
          title={t('versionDetail.uninstallConfirm.title')}
          message={t('versionDetail.uninstallConfirm.message', { size: formatBytes(status?.sizeBytes ?? 0) })}
          confirmLabel={t('versionDetail.uninstallConfirm.confirm')}
          cancelLabel={t('versionDetail.uninstallConfirm.cancel')}
          onCancel={() => setConfirmingUninstall(false)}
          onConfirm={() => { setConfirmingUninstall(false); void uninstall(id) }}
        />
      )}
    </>
  )
}
