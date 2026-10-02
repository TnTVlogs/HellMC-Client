import { useState } from 'preact/hooks'
import { t } from '../../i18n'
import { Button } from '../../components/Button'
import { Card } from '../../components/Card'
import { hellmc } from '../../api'
import { devModeRevealed } from '../../stores/ui'

const LINKS = {
  website: 'https://hellmcclient.sergidalmau.dev',
  source: 'https://github.com/TnTVlogs/HellMC-Client',
  support: 'https://github.com/TnTVlogs/HellMC-Client/issues',
  heliosLauncher: 'https://github.com/dscalzi/HeliosLauncher',
  heliosCore: 'https://github.com/dscalzi/helios-core',
  nebula: 'https://github.com/dscalzi/Nebula'
}

const REVEAL_CLICKS = 7

/**
 * 07 §6.1 «Sobre → Crèdits i llicències» (D23): atribució exacta ja escrita a `README.md`
 * (fork de HeliosLauncher, HellMC-Core/helios-core, Nebula) — reutilitzada aquí, mai a la
 * pantalla de càrrega (restricció explícita de D23). Clicar el número de versió unes quantes
 * vegades revela el mode desenvolupador a Launcher (07 §6, «ocult per defecte») — mateix patró
 * conegut (Android/Chrome «Build number»), sense cap altre lloc per desbloquejar-lo.
 */
export function AboutSection() {
  const [clicks, setClicks] = useState(0)

  function handleVersionClick() {
    const next = clicks + 1
    setClicks(next)
    if (next >= REVEAL_CLICKS) {
      devModeRevealed.value = true
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
      <Card>
        <h2 style={{ margin: 0, fontSize: 'var(--fs-lg)', fontWeight: 600, color: 'var(--text)' }}>HellMC Client</h2>
        <p
          onClick={handleVersionClick}
          style={{ margin: 'var(--space-2) 0 var(--space-4)', color: 'var(--text-faint)', cursor: 'default', userSelect: 'none' }}
        >
          {t('settings.updates.currentVersion')}: {hellmc.system.appVersion}
        </p>
        <div style={{ display: 'flex', gap: 'var(--space-2)', flexWrap: 'wrap' }}>
          <Button variant="secondary" size="sm" onClick={() => void hellmc.system.openExternal(LINKS.website)}>
            {t('settings.about.website')}
          </Button>
          <Button variant="secondary" size="sm" onClick={() => void hellmc.system.openExternal(LINKS.source)}>
            {t('settings.about.source')}
          </Button>
          <Button variant="secondary" size="sm" onClick={() => void hellmc.system.openExternal(LINKS.support)}>
            {t('settings.about.support')}
          </Button>
        </div>
      </Card>

      <Card>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)', color: 'var(--text-muted)' }}>
          <p style={{ margin: 0 }}>
            {t('settings.about.forkNotice')}{' '}
            <a href="#" onClick={(e) => { e.preventDefault(); void hellmc.system.openExternal(LINKS.heliosLauncher) }}>
              {LINKS.heliosLauncher}
            </a>
          </p>
          <p style={{ margin: 0 }}>
            {t('settings.about.coreNotice')}{' '}
            <a href="#" onClick={(e) => { e.preventDefault(); void hellmc.system.openExternal(LINKS.heliosCore) }}>
              {LINKS.heliosCore}
            </a>
          </p>
          <p style={{ margin: 0 }}>
            {t('settings.about.nebulaNotice')}{' '}
            <a href="#" onClick={(e) => { e.preventDefault(); void hellmc.system.openExternal(LINKS.nebula) }}>
              {LINKS.nebula}
            </a>
          </p>
        </div>
        <div style={{ marginTop: 'var(--space-4)' }}>
          <Button variant="ghost" size="sm" onClick={() => void hellmc.system.openThirdPartyLicenses()}>
            {t('settings.about.thirdPartyLicenses')}
          </Button>
        </div>
      </Card>
    </div>
  )
}
