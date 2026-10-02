import type { ComponentChildren } from 'preact'
import { useState } from 'preact/hooks'
import { navigate, route, type RouteName } from '../router'
import { t } from '../i18n'
import { Card } from './Card'
import { Button } from './Button'
import { ConfirmDialog } from './ConfirmDialog'
import { instances, killInstance } from '../stores/instances'
import { unreadCount } from '../stores/news'

const NAV_ITEMS: { name: RouteName; labelKey: 'nav.home' | 'nav.servers' | 'nav.versions' | 'nav.news' | 'nav.settings' }[] = [
  { name: 'home', labelKey: 'nav.home' },
  { name: 'servers', labelKey: 'nav.servers' },
  { name: 'versions', labelKey: 'nav.versions' },
  { name: 'news', labelKey: 'nav.news' },
  { name: 'settings', labelKey: 'nav.settings' }
]

// 2.11 (petició de l'usuari): indicador d'instàncies de joc obertes, sempre visible des de
// qualsevol pantalla (no només Inici) — motiu real: el botó Jugar torna a l'estat normal abans que
// la finestra de Minecraft arribi a aparèixer, i sense cap senyal visible l'usuari pensava que no
// havia passat res i tornava a prémer Jugar. S'amaga del tot si no hi ha cap instància (no calia
// ocupar espai permanentment per un cas que normalment no passa).
function InstancesIndicator() {
  const list = instances.value
  const [open, setOpen] = useState(false)
  // Confirmació abans de tancar per la força (petició de l'usuari): **al mig de la finestra**
  // (`ConfirmDialog`), no dins la pop-over de la barra lateral com al primer intent — la barra
  // lateral és estreta (`--sidebar-w`) i, depenent de l'idioma, el text de confirmació podia no
  // cabre-hi. Una acció que perd progrés no desat es mereix el centre de la pantalla, no un racó.
  const [confirmingId, setConfirmingId] = useState<string | null>(null)
  const confirmingInstance = list.find((i) => i.id === confirmingId) ?? null

  if (list.length === 0) return null

  return (
    <div style={{ position: 'relative' }}>
      {open && (
        <Card
          style={{
            position: 'absolute',
            bottom: '100%',
            left: 0,
            right: 0,
            marginBottom: 'var(--space-2)',
            zIndex: 10,
            display: 'flex',
            flexDirection: 'column',
            gap: 'var(--space-2)'
          }}
        >
          {list.map((instance) => (
            <div key={instance.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 'var(--space-2)' }}>
              <span style={{ fontSize: 'var(--fs-sm)', color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {instance.versionId}
              </span>
              <Button size="sm" variant="danger" onClick={() => setConfirmingId(instance.id)}>
                {t('instances.forceClose')}
              </Button>
            </div>
          ))}
        </Card>
      )}
      <button type="button" class="nav-item" onClick={() => setOpen((v) => !v)}>
        {t('instances.running', { count: list.length })}
      </button>
      {confirmingInstance != null && (
        <ConfirmDialog
          title={t('instances.confirmTitle')}
          message={t('instances.confirmMessage', { version: confirmingInstance.versionId })}
          confirmLabel={t('instances.confirmForceClose')}
          cancelLabel={t('instances.cancel')}
          onCancel={() => setConfirmingId(null)}
          onConfirm={() => { setConfirmingId(null); void killInstance(confirmingInstance.id) }}
        />
      )}
    </div>
  )
}

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
              {item.name === 'news' && unreadCount.value > 0 && (
                <span
                  style={{
                    marginLeft: 'var(--space-2)',
                    minWidth: 18,
                    height: 18,
                    padding: '0 5px',
                    borderRadius: 999,
                    background: 'var(--accent-fill)',
                    color: '#fff',
                    fontSize: 11,
                    fontWeight: 600,
                    display: 'inline-flex',
                    alignItems: 'center',
                    justifyContent: 'center'
                  }}
                >
                  {unreadCount.value}
                </span>
              )}
            </button>
          ))}
          <div style={{ marginTop: 'auto' }}>
            <InstancesIndicator />
          </div>
        </nav>
        <main class="app-content">{children}</main>
      </div>
    </div>
  )
}
