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

/**
 * 07 §6 «Configuració»: subnavegació interna (columna esquerra) + contingut per secció — abans
 * (2.3 §14) una sola pàgina plana amb només Aparença+Joc (dades compartides). `route.params.section`
 * ja ho preveia el router des del pas 1 (2.0, `router.ts` fa `section ?? 'account'`), només calia
 * construir-hi la subnav al damunt.
 */
export function Settings() {
  const active = (route.value.params.section as SectionId | undefined) ?? 'account'

  return (
    <div style={{ display: 'flex', gap: 'var(--space-6)', alignItems: 'flex-start' }}>
      <nav style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-1)', width: 180, flexShrink: 0 }} aria-label={t('nav.settings')}>
        {SECTIONS.map((section) => (
          <button
            key={section.id}
            type="button"
            class={`nav-item${active === section.id ? ' nav-item-active' : ''}`}
            onClick={() => navigate(`/settings/${section.id}`)}
          >
            {t(section.labelKey)}
          </button>
        ))}
      </nav>
      <div style={{ flex: 1, minWidth: 0 }}>
        {active === 'account' && <AccountSection />}
        {active === 'game' && <GameSection />}
        {active === 'java' && <JavaSection />}
        {active === 'launcher' && <LauncherSection />}
        {active === 'updates' && <UpdatesSection />}
        {active === 'about' && <AboutSection />}
      </div>
    </div>
  )
}
