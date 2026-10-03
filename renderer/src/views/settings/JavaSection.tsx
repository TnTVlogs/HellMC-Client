import { useEffect, useState } from 'preact/hooks'
import { t } from '../../i18n'
import { Button } from '../../components/Button'
import { Card } from '../../components/Card'
import { hellmc, type JavaInstallation } from '../../api'

/**
 * 07 §6 «Java»: valors globals per defecte + instal·lacions detectades. **Mai** toca la
 * configuració d'una versió (`config.getVersion`/`setVersion` continua sent la font de veritat per
 * versió) — això només és la llavor per a versions noves (`defaultJavaConfig*`).
 */
export function JavaSection() {
  const [globalExecutable, setGlobalExecutableState] = useState<string | null>(null)
  const [installations, setInstallations] = useState<JavaInstallation[] | null>(null)
  const [scanning, setScanning] = useState(false)

  async function scan() {
    setScanning(true)
    try {
      setInstallations(await hellmc.java.listInstallations())
    } finally {
      setScanning(false)
    }
  }

  useEffect(() => {
    void hellmc.java.getGlobalExecutable().then(setGlobalExecutableState)
    void scan()
  }, [])

  async function handleChoose() {
    const picked = await hellmc.java.pick()
    if (picked == null) return
    await hellmc.java.setGlobalExecutable(picked)
    setGlobalExecutableState(picked)
  }

  async function handleClear() {
    await hellmc.java.setGlobalExecutable(null)
    setGlobalExecutableState(null)
  }

  return (
    <section class="spanel">
      <h2>Java</h2>
      <Card>
        <div class="set-row">
          <div class="l">
            <b>{t('settings.java.globalExecutable')}</b>
            <span>{t('settings.java.globalExecutableHelp')}</span>
            <span class="num" style={{ display: 'block', wordBreak: 'break-all', color: globalExecutable != null ? 'var(--text)' : 'var(--text-faint)' }}>
              {globalExecutable ?? t('settings.java.notSet')}
            </span>
          </div>
          <div style={{ display: 'flex', gap: 'var(--space-2)' }}>
            <Button size="sm" onClick={() => void handleChoose()}>{t('settings.java.choose')}</Button>
            {globalExecutable != null && <Button size="sm" variant="ghost" onClick={() => void handleClear()}>{t('settings.java.clear')}</Button>}
          </div>
        </div>
      </Card>

      <div class="section-title" style={{ margin: 0 }}>
        <h2>{t('settings.java.detectedTitle')}</h2><span class="spacer" />
        <Button size="sm" disabled={scanning} onClick={() => void scan()}>{t('ui.rescan')}</Button>
      </div>
      <Card>
        {scanning && <p class="muted" style={{ padding: 'var(--space-5)' }}>{t('settings.java.detecting')}</p>}
        {!scanning && installations != null && installations.length === 0 && <p class="muted" style={{ padding: 'var(--space-5)' }}>{t('settings.java.detectedEmpty')}</p>}
        {!scanning && installations?.map((jvm) => (
          <div key={jvm.path} class="set-row">
            <div class="l"><b>{jvm.vendor} {jvm.version}</b><span class="num" style={{ wordBreak: 'break-all' }}>{jvm.path}</span></div>
          </div>
        ))}
      </Card>
    </section>
  )
}
