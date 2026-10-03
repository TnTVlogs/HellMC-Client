import { useState } from 'preact/hooks'
import { t } from '../../i18n'
import { Button } from '../../components/Button'
import { BrandFlame } from '../../components/BrandFlame'
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

function ExtLink({ href, children }: { href: string; children: string }) {
  return <a href={href} onClick={(e) => { e.preventDefault(); void hellmc.system.openExternal(href) }}>{children}</a>
}

/**
 * 07 §6.1 «Sobre → Crèdits i llicències» (D23): atribució exacta (fork de HeliosLauncher,
 * HellMC-Core/helios-core, Nebula) — mai a la pantalla de càrrega. Clicar el número de versió
 * diverses vegades revela el mode desenvolupador a Launcher (patró «Build number» d'Android).
 */
export function AboutSection() {
  const [clicks, setClicks] = useState(0)

  function handleVersionClick() {
    const next = clicks + 1
    setClicks(next)
    if (next >= REVEAL_CLICKS) devModeRevealed.value = true
  }

  return (
    <section class="spanel">
      <h2>{t('ui.aboutTitle')}</h2>
      <div class="card pad" style={{ display: 'flex', gap: 'var(--space-5)', alignItems: 'center' }}>
        <div class="welcome" style={{ padding: 0, width: 'auto' }}>
          <div class="logo" style={{ width: 64, height: 64 }}><BrandFlame size={36} /></div>
        </div>
        <div>
          <b>HellMC Client</b>
          <div class="muted small num" onClick={handleVersionClick} style={{ cursor: 'default', userSelect: 'none' }}>
            {t('ui.versionLabel')} {hellmc.system.appVersion}
          </div>
          <div style={{ display: 'flex', gap: 8, marginTop: 10, flexWrap: 'wrap' }}>
            <Button size="sm" onClick={() => void hellmc.system.openExternal(LINKS.website)}>{t('settings.about.website')}</Button>
            <Button size="sm" onClick={() => void hellmc.system.openExternal(LINKS.source)}>{t('settings.about.source')}</Button>
            <Button size="sm" onClick={() => void hellmc.system.openExternal(LINKS.support)}>{t('settings.about.support')}</Button>
          </div>
        </div>
      </div>

      <div class="card pad credits">
        <h3>{t('ui.credits')}</h3>
        <p>{t('settings.about.forkNotice')} <ExtLink href={LINKS.heliosLauncher}>HeliosLauncher</ExtLink></p>
        <ul>
          <li>{t('settings.about.coreNotice')} <ExtLink href={LINKS.heliosCore}>helios-core</ExtLink></li>
          <li>{t('settings.about.nebulaNotice')} <ExtLink href={LINKS.nebula}>Nebula</ExtLink></li>
          <li>{t('ui.assetsCredits')}</li>
        </ul>
        <div style={{ display: 'flex', gap: 8, marginTop: 'var(--space-4)', flexWrap: 'wrap' }}>
          <Button size="sm" onClick={() => void hellmc.system.openThirdPartyLicenses()}>{t('settings.about.thirdPartyLicenses')}</Button>
          <Button size="sm" variant="ghost" onClick={() => void hellmc.system.openLgplLicense()}>{t('settings.about.lgplLicense')}</Button>
        </div>
      </div>
    </section>
  )
}
