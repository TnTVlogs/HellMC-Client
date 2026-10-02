import { useEffect, useMemo, useState } from 'preact/hooks'
import { marked } from 'marked'
import DOMPurify from 'dompurify'
import { t } from '../i18n'
import { Button } from '../components/Button'
import { Card } from '../components/Card'
import { Tabs } from '../components/Tabs'
import { ConfirmDialog } from '../components/ConfirmDialog'
import { Toggle } from '../components/Toggle'
import { navigate } from '../router'
import { distro } from '../stores/distro'
import { selectServer, selectVersion } from '../stores/selection'
import { launch } from '../stores/launch'
import { statuses, progress, busy, refreshStatus, install, verify, uninstall } from '../stores/versions'
import { hellmc, type VersionSettings, type JavaInfo, type JavaDownloadProgress, type DataSharingPreference, type ModInfo } from '../api'
import { formatBytes } from '../utils/format'
import { build as buildModGroup, type ModGroupState } from '../utils/modgroups'

// 07 §4.2: pestanyes Resum + Java/memòria + Fitxers + Mods.

function FilesTab({ versionId }: { versionId: string }) {
  const status = statuses.value[versionId]
  if (status == null) {
    return <p style={{ color: 'var(--text-muted)' }}>{t('home.loadingDistro')}</p>
  }
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-1)' }}>
        <span style={{ fontSize: 'var(--fs-sm)', color: 'var(--text-faint)' }}>{t('versionDetail.files.path')}</span>
        <span style={{ color: 'var(--text)', wordBreak: 'break-all' }}>{status.path}</span>
        {!status.installed && (
          <span style={{ fontSize: 'var(--fs-sm)', color: 'var(--text-muted)' }}>{t('versionDetail.files.notInstalled')}</span>
        )}
      </div>
      {status.installed && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-1)' }}>
          <span style={{ fontSize: 'var(--fs-sm)', color: 'var(--text-faint)' }}>{t('versionDetail.files.size')}</span>
          <span style={{ color: 'var(--text)' }}>{formatBytes(status.sizeBytes)}</span>
        </div>
      )}
      <Button
        variant="secondary"
        size="sm"
        disabled={!status.installed}
        style={{ alignSelf: 'flex-start' }}
        onClick={() => void hellmc.system.openPath(status.path)}
      >
        {t('versionDetail.files.openFolder')}
      </Button>
    </div>
  )
}

// `ready` es mostra només l'instant entre extreure i que `handleDownload` netegi l'estat — es
// reaprofita el text d'«Extraient» en comptes d'una clau pròpia per a una fracció de segon.
const DOWNLOAD_PHASE_KEYS: Record<JavaDownloadProgress['phase'], string> = {
  'fetching-jdk': 'versionDetail.java.phase.fetchingJdk',
  'downloading-java': 'versionDetail.java.phase.downloadingJava',
  'extracting-java': 'versionDetail.java.phase.extractingJava',
  ready: 'versionDetail.java.phase.extractingJava'
}

function JavaMemoryTab({ versionId }: { versionId: string }) {
  const [settings, setSettings] = useState<VersionSettings | null>(null)
  const [javaInfo, setJavaInfo] = useState<JavaInfo | null>(null)
  const [detecting, setDetecting] = useState(false)
  const [downloading, setDownloading] = useState(false)
  const [downloadProgress, setDownloadProgress] = useState<JavaDownloadProgress | null>(null)
  const [downloadFailed, setDownloadFailed] = useState(false)

  useEffect(() => {
    void hellmc.config.getVersion(versionId).then(setSettings)
  }, [versionId])

  // Progrés en viu de `hellmc:java-download-progress` (fases fetching-jdk/downloading-java/
  // extracting-java) — filtrat per `versionId` perquè un altre `VersionDetail` obert no interfereixi.
  useEffect(() => {
    return hellmc.java.onDownloadProgress((vId, p) => {
      if (vId === versionId) setDownloadProgress(p)
    })
  }, [versionId])

  async function handleDetect() {
    setDetecting(true)
    try {
      const info = await hellmc.java.detect(versionId)
      setJavaInfo(info)
      if (info.available) {
        setSettings(await hellmc.config.getVersion(versionId))
      }
    } finally {
      setDetecting(false)
    }
  }

  async function handlePick() {
    const picked = await hellmc.java.pick()
    if (picked == null) return
    await hellmc.config.setVersion(versionId, { executable: picked })
    setSettings(await hellmc.config.getVersion(versionId))
  }

  // 2.3: només ofert un cop `detect` ja ha confirmat que no n'hi ha cap de compatible (mateix
  // moment que l'app antiga, `landing.js:asyncSystemScan`, ofereix el diàleg de baixada).
  async function handleDownload() {
    setDownloading(true)
    setDownloadFailed(false)
    setDownloadProgress({ phase: 'fetching-jdk', percent: 0 })
    try {
      const info = await hellmc.java.download(versionId)
      setJavaInfo(info)
      setSettings(await hellmc.config.getVersion(versionId))
    } catch {
      setDownloadFailed(true)
    } finally {
      setDownloading(false)
      setDownloadProgress(null)
    }
  }

  async function handleRamChange(field: 'minRAM' | 'maxRAM', value: string) {
    await hellmc.config.setVersion(versionId, { [field]: value })
    setSettings(await hellmc.config.getVersion(versionId))
  }

  if (settings == null) {
    return <p style={{ color: 'var(--text-muted)' }}>{t('home.loadingDistro')}</p>
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
        <span style={{ fontSize: 'var(--fs-sm)', color: 'var(--text-faint)' }}>{t('versionDetail.java.executable')}</span>
        <span style={{ color: 'var(--text)' }}>{settings.executable ?? t('versionDetail.java.notConfigured')}</span>
        {javaInfo != null && !javaInfo.available && (
          <span style={{ color: 'var(--danger)', fontSize: 'var(--fs-sm)' }}>{t('versionDetail.java.noneFound')}</span>
        )}
        {downloadFailed && (
          <span style={{ color: 'var(--danger)', fontSize: 'var(--fs-sm)' }}>{t('versionDetail.java.downloadFailed')}</span>
        )}
        <div style={{ display: 'flex', gap: 'var(--space-2)', flexWrap: 'wrap' }}>
          <Button variant="secondary" size="sm" disabled={detecting || downloading} onClick={() => void handleDetect()}>
            {detecting ? t('versionDetail.java.detecting') : t('versionDetail.java.autoDetect')}
          </Button>
          <Button variant="ghost" size="sm" disabled={downloading} onClick={() => void handlePick()}>{t('versionDetail.java.chooseManually')}</Button>
          {javaInfo != null && !javaInfo.available && (
            <Button variant="primary" size="sm" disabled={downloading} onClick={() => void handleDownload()}>
              {t('versionDetail.java.downloadAuto')}
            </Button>
          )}
        </div>
        {downloading && downloadProgress != null && (
          <span style={{ color: 'var(--text-muted)', fontSize: 'var(--fs-sm)' }}>
            {t(DOWNLOAD_PHASE_KEYS[downloadProgress.phase])}
            {downloadProgress.phase === 'downloading-java' ? ` — ${downloadProgress.percent}%` : ''}
          </span>
        )}
      </div>

      <div style={{ display: 'flex', gap: 'var(--space-4)' }}>
        <label style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-1)' }}>
          <span style={{ fontSize: 'var(--fs-sm)', color: 'var(--text-faint)' }}>{t('versionDetail.java.minRam')}</span>
          <input class="input" value={settings.minRAM} onChange={(e) => void handleRamChange('minRAM', (e.target as HTMLInputElement).value)} />
        </label>
        <label style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-1)' }}>
          <span style={{ fontSize: 'var(--fs-sm)', color: 'var(--text-faint)' }}>{t('versionDetail.java.maxRam')}</span>
          <input class="input" value={settings.maxRAM} onChange={(e) => void handleRamChange('maxRAM', (e.target as HTMLInputElement).value)} />
        </label>
      </div>
    </div>
  )
}

// 07 §4.4 (D26): interruptor per versió, sota les accions de Resum. Amagat del tot si la versió és
// `forcedSeparate` (l'admin la fixa, 01 §3.1.1) — en el seu lloc un text fix explicant per què, mai
// l'interruptor desactivat (podria semblar que el jugador el pot canviar si insisteix).
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
    return (
      <p style={{ margin: 0, fontSize: 'var(--fs-sm)', color: 'var(--text-muted)' }} title={t('versionDetail.dataSharing.forcedTooltip')}>
        {t('versionDetail.dataSharing.forcedNotice')}
      </p>
    )
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-1)' }}>
      <label style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)', cursor: 'pointer' }}>
        <Toggle checked={pref.shared} onChange={(v) => void handleChange(v)} label={t('versionDetail.dataSharing.title')} />
        <span style={{ color: 'var(--text)' }}>{t('versionDetail.dataSharing.title')}</span>
      </label>
      <p style={{ margin: 0, fontSize: 'var(--fs-sm)', color: 'var(--text-muted)' }}>{t('versionDetail.dataSharing.help')}</p>
      <p style={{ margin: 0, fontSize: 'var(--fs-sm)', color: 'var(--text-faint)' }}>{t('versionDetail.dataSharing.changeNotice')}</p>
    </div>
  )
}

// 07 §4.2 pt.2 (`docs/mod-dependency-groups`): mods opcionals com a grup (D1-D6). La lògica del graf
// (`utils/modgroups.ts`) és un port TS de `app/assets/js/modgroups.js`, ja provat i en ús real
// (`ProcessBuilder.enforceModDependencies` l'aplica a cada llançament des de la sessió 2026-09-24) —
// aquí només cal la UI, mai reimplementar l'algorisme. Llista **plana** sempre (D5): mai subgrups.
function ModsTab({ versionId }: { versionId: string }) {
  const [mods, setMods] = useState<ModInfo[] | null>(null)
  const [state, setState] = useState<ModGroupState>(new Map())
  const [search, setSearch] = useState('')
  const [note, setNote] = useState<string | null>(null)

  const graph = useMemo(() => (mods != null ? buildModGroup(mods.map((m) => ({ id: m.id, required: m.required, dependencies: m.dependencies }))) : null), [mods])
  const byId = useMemo(() => (mods != null ? new Map(mods.map((m) => [m.id, m])) : null), [mods])

  useEffect(() => {
    let cancelled = false
    async function load() {
      const [list, rawState] = await Promise.all([hellmc.mods.list(versionId), hellmc.mods.getState(versionId)])
      if (cancelled) return
      const initial: ModGroupState = new Map(list.filter((m) => !m.required).map((m) => [m.id, rawState[m.key] === true]))
      const g = buildModGroup(list.map((m) => ({ id: m.id, required: m.required, dependencies: m.dependencies })))
      // Coherència en obrir la pestanya (05-client.md §3.5): una configuració antiga pot tenir un
      // mod activat amb una dependència desactivada (p. ex. distribució nova amb dependències que
      // no existien quan es va desar l'estat). Es força i es persisteix de seguida, no s'espera a
      // cap acció del jugador.
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
    if (changed == null) return // xarxa de seguretat: l'interruptor ja hauria d'estar desactivat
    setState(next)
    const patch: Record<string, boolean> = {}
    for (const cid of changed) {
      const m = mods.find((x) => x.id === cid)
      if (m != null) patch[m.key] = next.get(cid) === true
    }
    await hellmc.mods.setState(versionId, patch)
    const others = changed.filter((cid) => cid !== mod.id)
    setNote(others.length > 0 ? t(checked ? 'versionDetail.mods.alsoEnabled' : 'versionDetail.mods.alsoDisabled', { list: nameList(others) }) : null)
  }

  if (mods == null || graph == null) {
    return <p style={{ color: 'var(--text-muted)' }}>{t('home.loadingDistro')}</p>
  }
  if (mods.length === 0) {
    return <p style={{ color: 'var(--text-muted)' }}>{t('versionDetail.mods.empty')}</p>
  }

  const query = search.trim().toLowerCase()
  const visible = query === '' ? mods : mods.filter((m) => m.name.toLowerCase().includes(query))
  const optionalCount = mods.filter((m) => !m.required).length
  const enabledCount = mods.filter((m) => !m.required && state.get(m.id) === true).length

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
      <div style={{ display: 'flex', gap: 'var(--space-3)', alignItems: 'center', flexWrap: 'wrap' }}>
        <input
          class="input"
          placeholder={t('versionDetail.mods.search')}
          value={search}
          onInput={(e) => setSearch((e.target as HTMLInputElement).value)}
          style={{ flex: '1 1 200px' }}
        />
        {optionalCount > 0 && (
          <span style={{ fontSize: 'var(--fs-sm)', color: 'var(--text-faint)' }}>
            {t('versionDetail.mods.count', { enabled: enabledCount, total: optionalCount })}
          </span>
        )}
      </div>

      {note != null && (
        <p style={{ margin: 0, fontSize: 'var(--fs-sm)', color: 'var(--accent)' }}>{note}</p>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
        {visible.map((m) => {
          const enabled = m.required || state.get(m.id) === true
          const blockers = !m.required && enabled ? graph.blockers(state, m.id) : []
          const blocked = blockers.length > 0
          return (
            <Card key={m.id} style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-1)' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 'var(--space-3)' }}>
                <span style={{ color: 'var(--text)' }}>{m.name}</span>
                {m.required ? (
                  <span style={{ fontSize: 'var(--fs-sm)', color: 'var(--text-faint)' }}>{t('versionDetail.mods.required')}</span>
                ) : (
                  <Toggle checked={enabled} disabled={blocked} onChange={(v) => void handleToggle(m, v)} label={m.name} />
                )}
              </div>
              {blocked && (
                <span style={{ fontSize: 'var(--fs-sm)', color: 'var(--text-muted)' }}>
                  {t('versionDetail.mods.blocked', { list: nameList(blockers) })}
                </span>
              )}
            </Card>
          )
        })}
      </div>
    </div>
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

  if (d == null) {
    return <p style={{ color: 'var(--text-muted)' }}>{t('home.loadingDistro')}</p>
  }
  if (version == null) {
    return (
      <Card>
        <p style={{ margin: 0, color: 'var(--text-muted)' }}>{t('versionDetail.notFound')}</p>
        <Button variant="secondary" style={{ marginTop: 'var(--space-3)' }} onClick={() => navigate('#/versions')}>
          {t('versionDetail.back')}
        </Button>
      </Card>
    )
  }

  const status = statuses.value[id]
  const taskProgress = progress.value[id]
  const isBusy = busy.value[id] === true
  const availableServers = d.servers.filter((s) => s.versions.some((v) => v.id === id))
  const changelogHtml = version.changelog != null ? DOMPurify.sanitize(marked.parse(version.changelog, { async: false })) : null

  async function handlePlayWithoutServer() {
    await selectServer(null)
    await selectVersion(id)
    navigate('#/')
    await launch({ serverId: null, versionId: id })
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
      <Button variant="ghost" size="sm" style={{ alignSelf: 'flex-start' }} onClick={() => navigate('#/versions')}>
        {t('versionDetail.back')}
      </Button>

      <h1 style={{ fontSize: 'var(--fs-2xl)', fontWeight: 600, color: 'var(--text)', margin: 0 }}>{version.name}</h1>
      <span style={{ fontSize: 'var(--fs-sm)', color: 'var(--text-muted)' }}>
        {version.minecraftVersion} · {version.loader}{version.loaderVersion ? ` ${version.loaderVersion}` : ''} · {version.version}
      </span>

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
        <Card style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
          <p style={{ margin: 0, color: 'var(--text-muted)' }}>{version.description}</p>

          <div style={{ display: 'flex', gap: 'var(--space-2)', flexWrap: 'wrap' }}>
            {status?.installed !== true && (
              <Button variant="primary" disabled={isBusy} onClick={() => void install(id)}>{t('versions.install')}</Button>
            )}
            {status?.installed === true && (
              <>
                <Button variant="primary" disabled={isBusy} onClick={() => void handlePlayWithoutServer()}>{t('home.play')}</Button>
                <Button variant="secondary" disabled={isBusy} onClick={() => void verify(id)}>{t('versionDetail.verify')}</Button>
                <Button variant="danger" disabled={isBusy} onClick={() => setConfirmingUninstall(true)}>{t('versionDetail.uninstall')}</Button>
              </>
            )}
          </div>

          {isBusy && taskProgress != null && (
            <span style={{ color: 'var(--text-muted)' }}>
              {t(`home.phase.${taskProgress.message}`)} — {Math.round(taskProgress.percent)}%
            </span>
          )}

          {status?.installed === true && !isBusy && (
            <span style={{ fontSize: 'var(--fs-sm)', color: 'var(--text-faint)' }}>
              {formatBytes(status.sizeBytes)}{status.needsUpdate ? ` · ${t('versions.updateAvailable')}` : ''}
            </span>
          )}

          <DataSharingToggle versionId={id} />

          {availableServers.length > 0 && (
            <div style={{ display: 'flex', gap: 'var(--space-2)', flexWrap: 'wrap' }}>
              {availableServers.map((s) => (
                <Button key={s.id} variant="ghost" size="sm" onClick={() => navigate(`#/servers/${s.id}`)}>{s.name}</Button>
              ))}
            </div>
          )}

          {changelogHtml != null && (
            <div style={{ borderTop: '1px solid var(--border)', paddingTop: 'var(--space-4)' }}>
              <h2 style={{ fontSize: 'var(--fs-md)', fontWeight: 600, color: 'var(--text)', margin: '0 0 var(--space-2)' }}>
                {t('versionDetail.changelog')}
              </h2>
              {/* Sanititzat amb DOMPurify just abans de calcular `changelogHtml` (07 §4.2) — mai HTML cru sense passar-hi. */}
              <div class="markdown-body" dangerouslySetInnerHTML={{ __html: changelogHtml }} />
            </div>
          )}
        </Card>
      )}

      {tab === 'mods' && <ModsTab versionId={id} />}

      {tab === 'java' && (
        <Card>
          <JavaMemoryTab versionId={id} />
        </Card>
      )}

      {tab === 'files' && (
        <Card>
          <FilesTab versionId={id} />
        </Card>
      )}

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
    </div>
  )
}
