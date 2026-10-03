import { useEffect, useState } from 'preact/hooks'
import { Info } from 'lucide-preact'
import { t } from '../../i18n'
import { Button } from '../../components/Button'
import { Toggle } from '../../components/Toggle'
import { Card } from '../../components/Card'
import { Banner, Progress } from '../../components/ui'
import { hellmc } from '../../api'

type Status = 'idle' | 'checking' | 'upToDate' | 'available' | 'downloading' | 'ready' | 'error'

/**
 * 07 §6 «Actualitzacions»: «com el de Discord» — mai cap assistent ni cap «Reinstal·la ara?». El
 * procés principal (`index.js`) comprova en silenci a l'arrencada + cada hora i instal·la sol en
 * tancar (`autoInstallOnAppQuit`, `nsis.oneClick`); aquí només hi ha «Comprova ara» i l'estat en
 * viu. **Deliberadament sense «Instal·la i reinicia»**: forçar un tancament contradiu «que es faci sol».
 */
export function UpdatesSection() {
  const [status, setStatus] = useState<Status>('idle')
  const [percent, setPercent] = useState(0)
  const [version, setVersion] = useState<string | null>(null)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [prerelease, setPrerelease] = useState(false)

  useEffect(() => {
    const unsubscribe = hellmc.updater.onEvent((event) => {
      switch (event.type) {
        case 'checking-for-update': setStatus('checking'); break
        case 'update-not-available': setStatus('upToDate'); break
        case 'update-available': setStatus('available'); setVersion(event.info?.version ?? null); break
        case 'download-progress': setStatus('downloading'); setPercent(Math.round(event.info?.percent ?? 0)); break
        case 'update-downloaded': setStatus('ready'); break
        case 'error': setStatus('error'); setErrorMessage(event.info?.message ?? null); break
      }
    })
    void hellmc.updater.getPrerelease().then(setPrerelease)
    void hellmc.updater.check()
    return unsubscribe
  }, [])

  const statusLine = (() => {
    switch (status) {
      case 'checking': return t('settings.updates.checking')
      case 'upToDate': return t('settings.updates.upToDate')
      case 'available': return t('settings.updates.available', { version: version ?? '' })
      case 'downloading': return t('settings.updates.downloading', { percent })
      case 'ready': return `${t('settings.updates.ready')} ${t('settings.updates.readyHint')}`
      case 'error': return t('settings.updates.error', { message: errorMessage ?? '' })
      default: return null
    }
  })()

  return (
    <section class="spanel">
      <h2>{t('settings.updates.title')}</h2>
      {statusLine != null && (
        status === 'error'
          ? <Banner tone="warn">{statusLine}</Banner>
          : <Banner tone="info" icon={Info}>{statusLine}</Banner>
      )}
      {status === 'downloading' && <Progress value={percent} />}
      {status === 'checking' && <Progress value={null} />}
      <Card>
        <div class="set-row">
          <div class="l"><b>{t('settings.updates.currentVersion')}</b><span class="num">{hellmc.system.appVersion}</span></div>
          <Button size="sm" disabled={status === 'checking'} onClick={() => void hellmc.updater.check()}>{t('settings.updates.checkNow')}</Button>
        </div>
        <div class="set-row">
          <div class="l"><b>{t('settings.updates.channel')}</b><span>{t('settings.updates.channelHelp')}</span></div>
          <Toggle checked={prerelease} label={t('settings.updates.channel')}
            onChange={(v) => void hellmc.updater.setPrerelease(v).then((effective) => { setPrerelease(effective); void hellmc.updater.check() })} />
        </div>
      </Card>
    </section>
  )
}
