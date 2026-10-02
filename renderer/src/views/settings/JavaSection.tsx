import { useEffect, useState } from 'preact/hooks'
import { t } from '../../i18n'
import { Button } from '../../components/Button'
import { Card } from '../../components/Card'
import { hellmc, type JavaInstallation } from '../../api'

/**
 * 07 §6 «Java»: valors globals per defecte + llista d'instal·lacions detectades. **Mai** toca la
 * configuració d'una versió ja oberta a Versions > detall > Java (06 §5 `config.getVersion`/
 * `setVersion` continua sent la font de veritat per versió) — això només és la llavor per a
 * versions noves (`defaultJavaConfig*`, `configmanager.js`).
 */
export function JavaSection() {
  const [globalExecutable, setGlobalExecutableState] = useState<string | null>(null)
  const [installations, setInstallations] = useState<JavaInstallation[] | null>(null)
  const [scanning, setScanning] = useState(false)

  useEffect(() => {
    void hellmc.java.getGlobalExecutable().then(setGlobalExecutableState)
    setScanning(true)
    void hellmc.java.listInstallations().then((list) => {
      setInstallations(list)
      setScanning(false)
    })
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
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
      <Card>
        <h2 style={{ margin: 0, fontSize: 'var(--fs-lg)', fontWeight: 600, color: 'var(--text)' }}>
          {t('settings.java.globalExecutable')}
        </h2>
        <p style={{ fontSize: 'var(--fs-sm)', color: 'var(--text-faint)', margin: 'var(--space-2) 0 var(--space-3)' }}>
          {t('settings.java.globalExecutableHelp')}
        </p>
        <p style={{ color: globalExecutable != null ? 'var(--text)' : 'var(--text-muted)', margin: '0 0 var(--space-3)', wordBreak: 'break-all' }}>
          {globalExecutable ?? t('settings.java.notSet')}
        </p>
        <div style={{ display: 'flex', gap: 'var(--space-2)' }}>
          <Button variant="secondary" size="sm" onClick={() => void handleChoose()}>{t('settings.java.choose')}</Button>
          {globalExecutable != null && (
            <Button variant="ghost" size="sm" onClick={() => void handleClear()}>{t('settings.java.clear')}</Button>
          )}
        </div>
      </Card>

      <Card>
        <h2 style={{ margin: 0, fontSize: 'var(--fs-lg)', fontWeight: 600, color: 'var(--text)' }}>
          {t('settings.java.detectedTitle')}
        </h2>
        <div style={{ marginTop: 'var(--space-3)' }}>
          {scanning && <p style={{ color: 'var(--text-muted)', margin: 0 }}>{t('settings.java.detecting')}</p>}
          {!scanning && installations != null && installations.length === 0 && (
            <p style={{ color: 'var(--text-muted)', margin: 0 }}>{t('settings.java.detectedEmpty')}</p>
          )}
          {!scanning && installations != null && installations.length > 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
              {installations.map((jvm) => (
                <div key={jvm.path} style={{ padding: 'var(--space-2) 0', borderBottom: '1px solid var(--border)' }}>
                  <div style={{ color: 'var(--text)' }}>{jvm.vendor} {jvm.version}</div>
                  <div style={{ fontSize: 'var(--fs-sm)', color: 'var(--text-faint)', wordBreak: 'break-all' }}>{jvm.path}</div>
                </div>
              ))}
            </div>
          )}
        </div>
      </Card>
    </div>
  )
}
