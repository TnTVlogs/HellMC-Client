import { useEffect, useState } from 'preact/hooks'
import { t } from '../../i18n'
import { Button } from '../../components/Button'
import { Card } from '../../components/Card'
import { hellmc } from '../../api'

type Status = 'idle' | 'checking' | 'upToDate' | 'available' | 'downloading' | 'ready' | 'error'

/**
 * 07 §6 «Actualitzacions»: petició explícita de l'usuari (2026-10-02) — «com el de Discord», mai
 * cap assistent ni cap «Reinstal·la ara?» — només informatiu. El main process (`index.js`) ja
 * comprova en silenci a l'arrencada + cada hora i instal·la sola en tancar (`autoInstallOnAppQuit`,
 * `nsis.oneClick`) — aquesta pantalla només hi afegeix un botó «Comprova ara» (07 §6 ho demana
 * explícitament) i mostra l'estat en viu. **Deliberadament no hi ha cap botó «Instal·la i
 * reinicia»**: forçar un tancament mentre l'usuari és a la pantalla contradiria «que es faci sola».
 */
export function UpdatesSection() {
  const [status, setStatus] = useState<Status>('idle')
  const [percent, setPercent] = useState(0)
  const [version, setVersion] = useState<string | null>(null)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)

  useEffect(() => {
    const unsubscribe = hellmc.updater.onEvent((event) => {
      switch (event.type) {
        case 'checking-for-update':
          setStatus('checking')
          break
        case 'update-not-available':
          setStatus('upToDate')
          break
        case 'update-available':
          setStatus('available')
          setVersion(event.info?.version ?? null)
          break
        case 'download-progress':
          setStatus('downloading')
          setPercent(Math.round(event.info?.percent ?? 0))
          break
        case 'update-downloaded':
          setStatus('ready')
          break
        case 'error':
          setStatus('error')
          setErrorMessage(event.info?.message ?? null)
          break
      }
    })
    void hellmc.updater.check()
    return unsubscribe
  }, [])

  const statusLine = (() => {
    switch (status) {
      case 'checking': return t('settings.updates.checking')
      case 'upToDate': return t('settings.updates.upToDate')
      case 'available': return t('settings.updates.available', { version: version ?? '' })
      case 'downloading': return t('settings.updates.downloading', { percent })
      case 'ready': return t('settings.updates.ready')
      case 'error': return t('settings.updates.error', { message: errorMessage ?? '' })
      default: return null
    }
  })()

  return (
    <Card>
      <h2 style={{ margin: 0, fontSize: 'var(--fs-lg)', fontWeight: 600, color: 'var(--text)' }}>
        {t('settings.updates.title')}
      </h2>
      <p style={{ color: 'var(--text-faint)', margin: 'var(--space-2) 0 var(--space-4)' }}>
        {t('settings.updates.currentVersion')}: {hellmc.system.appVersion}
      </p>

      {statusLine != null && (
        <p style={{ color: status === 'error' ? 'var(--danger)' : 'var(--text)', margin: '0 0 var(--space-2)' }}>
          {statusLine}
        </p>
      )}
      {status === 'ready' && (
        <p style={{ color: 'var(--text-faint)', fontSize: 'var(--fs-sm)', margin: '0 0 var(--space-4)' }}>
          {t('settings.updates.readyHint')}
        </p>
      )}

      <Button variant="secondary" size="sm" disabled={status === 'checking'} onClick={() => void hellmc.updater.check()}>
        {t('settings.updates.checkNow')}
      </Button>
    </Card>
  )
}
