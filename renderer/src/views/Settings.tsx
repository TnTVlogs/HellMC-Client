import { t } from '../i18n'
import { navigate, route } from '../router'
import { AccountSection } from './settings/AccountSection'
import { GameSection } from './settings/GameSection'
import { JavaSection } from './settings/JavaSection'
import { LauncherSection } from './settings/LauncherSection'
import { UpdatesSection } from './settings/UpdatesSection'
import { AboutSection } from './settings/AboutSection'

type SectionId = 'account' | 'game' | 'java' | 'launcher' | 'updates' | 'about'

const SECTIONS: { id: SectionId; labelKey: `settings.nav.${SectionId}` }[] = [
  { id: 'account', labelKey: 'settings.nav.account' },
  { id: 'game', labelKey: 'settings.nav.game' },
  { id: 'java', labelKey: 'settings.nav.java' },
  { id: 'launcher', labelKey: 'settings.nav.launcher' },
  { id: 'updates', labelKey: 'settings.nav.updates' },
  { id: 'about', labelKey: 'settings.nav.about' }
]

/** 07 §6 «Configuració»: subnavegació (`.snav`, pestanyes horitzontals en compacte) + secció. */
export function Settings() {
  const active = (route.value.params.section as SectionId | undefined) ?? 'account'

  return (
    <>
      <div class="page-head"><div class="grow"><h1>{t('nav.settings')}</h1></div></div>
      <div class="settings">
        <div class="snav" role="tablist" aria-orientation="vertical" aria-label={t('nav.settings')}>
          {SECTIONS.map((section) => (
            <button key={section.id} type="button" role="tab" aria-selected={active === section.id}
              onClick={() => navigate(`/settings/${section.id}`)}>
              {t(section.labelKey)}
            </button>
          ))}
        </div>
        <div>
          {active === 'account' && <AccountSection />}
          {active === 'game' && <GameSection />}
          {active === 'java' && <JavaSection />}
          {active === 'launcher' && <LauncherSection />}
          {active === 'updates' && <UpdatesSection />}
          {active === 'about' && <AboutSection />}
        </div>
      </div>
    </>
  )
}
