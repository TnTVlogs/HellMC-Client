import type { ComponentChildren } from 'preact'
import { navigate, route, type RouteName } from '../router'
import { t } from '../i18n'

const NAV_ITEMS: { name: RouteName; labelKey: 'nav.home' | 'nav.servers' | 'nav.versions' | 'nav.news' | 'nav.settings' }[] = [
  { name: 'home', labelKey: 'nav.home' },
  { name: 'servers', labelKey: 'nav.servers' },
  { name: 'versions', labelKey: 'nav.versions' },
  { name: 'news', labelKey: 'nav.news' },
  { name: 'settings', labelKey: 'nav.settings' }
]

/**
 * 06 §7 / 08 §8: barra de títol pròpia (36px, drag region) + barra lateral + contingut routejat.
 * Encara sense responsiu (08 §6, breakpoints compacte/mitjà/ample) ni icones (Lucide, pendent
 * d'incorporar per llicència, 08 §7 última línia) — només text per ara.
 */
export function Shell({ children }: { children: ComponentChildren }) {
  return (
    <div class="app-shell">
      <div class="titlebar">
        <span class="titlebar-title">HellMC Client</span>
        <div class="titlebar-spacer" />
      </div>
      <div class="app-body">
        <nav class="sidebar" aria-label={t('nav.ariaLabel')}>
          {NAV_ITEMS.map((item) => (
            <button
              key={item.name}
              type="button"
              class={`nav-item${route.value.name === item.name ? ' nav-item-active' : ''}`}
              onClick={() => navigate(`/${item.name}`)}
            >
              {t(item.labelKey)}
            </button>
          ))}
        </nav>
        <main class="app-content">{children}</main>
      </div>
    </div>
  )
}
