import { useEffect, useState } from 'preact/hooks'
import { Flame, Download, WifiOff } from 'lucide-preact'
import { t } from '../i18n'
import { hellmc } from '../api'
import { Button } from '../components/Button'
import { loadDistro, distroLoading } from '../stores/distro'
import { loadSelection } from '../stores/selection'

/** 07 §8.1: logotip + indicador subtil. Sense menció a Helios (D23). Passats 5 s, text «Iniciant…». */
export function Loading() {
  const [slow, setSlow] = useState(false)
  useEffect(() => {
    const id = setTimeout(() => setSlow(true), 5000)
    return () => clearTimeout(id)
  }, [])
  return (
    <div class="app-shell" style={{ gridTemplateRows: 'minmax(0, 1fr)' }}>
      <div class="center-drag" />
      <main class="center-screen" aria-busy="true" style={{ gap: 'var(--space-5)', justifyItems: 'center', alignContent: 'center' }}>
        <div class="welcome" style={{ padding: 0 }}><div class="logo"><Flame size={40} fill="currentColor" /></div></div>
        <div class="wordmark">Hell<span>MC</span></div>
        <div class="spinner" role="status" />
        <p class="muted" style={{ minHeight: '1.5em' }}>{slow ? t('boot.starting') : ''}</p>
      </main>
    </div>
  )
}

/** 07 §7.2 / 09 O7, O10: primera arrencada sense distribució (ni en cache). */
export function NeedNetwork() {
  async function retry() {
    await loadDistro()
    await loadSelection()
  }
  return (
    <div class="app-shell" style={{ gridTemplateRows: 'minmax(0, 1fr)' }}>
      <div class="center-drag" />
      <main class="center-screen">
        <section class="card welcome">
          <div class="logo"><WifiOff size={36} /></div>
          <div><h1>{t('boot.needNetworkTitle')}</h1><p class="muted" style={{ marginTop: 8 }}>{t('boot.needNetworkBody')}</p></div>
          <Button variant="primary" size="lg" disabled={distroLoading.value} onClick={() => void retry()}>{t('boot.retry')}</Button>
        </section>
      </main>
    </div>
  )
}

/** 07 §2.4: la distribució exigeix un client més nou → bloqueig amb «Actualitza el client». L'updater
 * (`electron-updater`) baixa en silenci; aquí només es força la comprovació i es mostra l'estat. */
export function UpdateRequired() {
  type S = 'idle' | 'checking' | 'none' | 'downloading' | 'ready'
  const [status, setStatus] = useState<S>('idle')
  const [percent, setPercent] = useState(0)

  useEffect(() => hellmc.updater.onEvent((e) => {
    if (e.type === 'checking-for-update') setStatus('checking')
    else if (e.type === 'update-not-available') setStatus('none')
    else if (e.type === 'update-available') setStatus('downloading')
    else if (e.type === 'download-progress') { setStatus('downloading'); setPercent(Math.round(e.info?.percent ?? 0)) }
    else if (e.type === 'update-downloaded') setStatus('ready')
  }), [])

  useEffect(() => { void hellmc.updater.check() }, [])

  const line = status === 'checking' ? t('boot.updateRequired.checking')
    : status === 'none' ? t('boot.updateRequired.none')
    : status === 'downloading' ? t('boot.updateRequired.downloading', { percent })
    : status === 'ready' ? t('boot.updateRequired.ready') : null

  return (
    <div class="app-shell" style={{ gridTemplateRows: 'minmax(0, 1fr)' }}>
      <div class="center-drag" />
      <main class="center-screen">
        <section class="card welcome" role="alertdialog" aria-labelledby="ur-title">
          <div class="logo"><Download size={36} /></div>
          <div><h1 id="ur-title">{t('boot.updateRequired.title')}</h1><p class="muted" style={{ marginTop: 8 }}>{t('boot.updateRequired.body')}</p></div>
          {line != null && <p class="muted small" aria-live="polite">{line}</p>}
          {status === 'ready'
            ? <Button variant="primary" size="lg" onClick={() => void hellmc.updater.install()}>{t('boot.updateRequired.restart')}</Button>
            : <Button variant="primary" size="lg" disabled={status === 'checking' || status === 'downloading'} onClick={() => void hellmc.updater.check()}>{t('boot.updateRequired.check')}</Button>}
        </section>
      </main>
    </div>
  )
}
