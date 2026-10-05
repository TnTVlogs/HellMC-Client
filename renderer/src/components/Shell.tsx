import type { ComponentChildren } from 'preact'
import { useEffect, useRef, useState } from 'preact/hooks'
import { Gamepad2, Globe, Home, Layers, MessageCircle, Newspaper, Plus, Server, Settings, type LucideIcon } from 'lucide-preact'
import { navigate, route, type RouteName } from '../router'
import { t } from '../i18n'
import { hellmc } from '../api'
import { Button } from './Button'
import { ConfirmDialog } from './ConfirmDialog'
import { Popover } from './Popover'
import { BrandFlame } from './BrandFlame'
import { Avatar, Banner, RingProgress, StatusDot } from './ui'
import { instances, killInstance } from '../stores/instances'
import { distro } from '../stores/distro'
import { unreadCount } from '../stores/news'
import { minecraftServices, online, sessionInvalid } from '../stores/network'
import { sidebarCollapsed } from '../stores/ui'
import { accounts, selectedAccount, selectAccount, loadAccounts } from '../stores/account'
import { activeLaunch } from '../stores/launch'

type NavKey = 'nav.home' | 'nav.servers' | 'nav.versions' | 'nav.news'

// Icones: Lucide (ISC, `lucide-preact`, 08 §7). La barra compacta (< 960 px) només en mostra la
// icona; l'etiqueta queda com a `title`/`aria-label`.
const NAV_ITEMS: { name: RouteName; labelKey: NavKey; Icon: LucideIcon }[] = [
  { name: 'home', labelKey: 'nav.home', Icon: Home },
  { name: 'servers', labelKey: 'nav.servers', Icon: Server },
  { name: 'versions', labelKey: 'nav.versions', Icon: Layers },
  { name: 'news', labelKey: 'nav.news', Icon: Newspaper }
]

const LINKS = { discord: 'https://discord.gg/yScnSw7cFt', website: 'https://hellmcclient.sergidalmau.dev' }

/** Tasca activa (07 §9): progrés circular + fase; porta a Inici on hi ha el detall. */
function TaskIndicator() {
  const p = activeLaunch.value
  if (p == null) return null
  const label = t(`home.phase.${p.phase}`)
  return (
    <button type="button" class="task" title={`${label} · ${Math.round(p.percent)}%`} onClick={() => navigate('/home')}
      style={{ cursor: 'pointer', textAlign: 'left', color: 'inherit', font: 'inherit' }}>
      <RingProgress value={p.percent} size={32} />
      <div class="t"><b>{label}</b><span class="muted xs">{Math.round(p.percent)}%</span></div>
    </button>
  )
}

// 2.11: instàncies obertes, visibles des de qualsevol pantalla (el botó Jugar torna a l'estat normal
// abans que aparegui la finestra de Minecraft i sense senyal l'usuari tornava a prémer-lo).
function InstancesIndicator() {
  const list = instances.value
  const [open, setOpen] = useState(false)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const [confirmingId, setConfirmingId] = useState<string | null>(null)
  if (list.length === 0) return null
  const versionName = (id: string) => distro.value?.versions.find((v) => v.id === id)?.name ?? id
  const confirmingInstance = confirmingId != null ? list.find((i) => i.id === confirmingId) ?? null : null

  return (
    <div>
      {open && (
        <Popover anchor={triggerRef.current} onClose={() => setOpen(false)} width={300}>
          <div style={{ padding: 'var(--space-3)', display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
            {list.map((instance) => (
              <div key={instance.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 'var(--space-2)' }}>
                <span class="small" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{versionName(instance.versionId)}</span>
                <Button size="sm" variant="danger" onClick={() => { setOpen(false); setConfirmingId(instance.id) }}>{t('instances.forceClose')}</Button>
              </div>
            ))}
          </div>
        </Popover>
      )}
      <button ref={triggerRef} type="button" class="nav-item" title={t('instances.running', { count: list.length })} onClick={() => setOpen((v) => !v)}>
        <Gamepad2 size={20} />
        <span class="nav-label">{t('instances.running', { count: list.length })}</span>
      </button>
      {confirmingInstance != null && (
        <ConfirmDialog
          title={t('instances.confirmTitle')}
          message={t('instances.confirmMessage', { version: versionName(confirmingInstance.versionId) })}
          confirmLabel={t('instances.confirmForceClose')}
          cancelLabel={t('instances.cancel')}
          onCancel={() => setConfirmingId(null)}
          onConfirm={() => { setConfirmingId(null); void killInstance(confirmingInstance.id) }}
        />
      )}
    </div>
  )
}

/** 07 §1.1: punt d'estat dels serveis de Minecraft (verd/groc/vermell), amb detall al tooltip. */
function MinecraftStatus() {
  const services = minecraftServices.value
  const names: Record<string, string> = { session: t('ui.svcSession'), services: t('ui.svcServices'), auth: t('ui.svcAuth') }
  const upCount = services?.filter((s) => s.ok).length ?? 0
  const state = services == null ? 'off' : upCount === services.length ? 'on' : upCount === 0 ? 'bad' : 'warn'
  const label = services == null ? t('ui.minecraftChecking') : state === 'on' ? t('ui.minecraftOk') : state === 'bad' ? t('ui.minecraftDown') : t('ui.minecraftPartial')
  const detail = services?.map((s) => `${s.ok ? '●' : '○'} ${names[s.id] ?? s.id}`).join('\n') ?? ''
  return (
    <div class="mojang" title={detail !== '' ? `${label}\n${detail}` : label} role="status" aria-label={label}>
      <StatusDot state={state} /><span class="t">{label}</span>
    </div>
  )
}

/** 07 §8.4: compte actiu a la barra lateral + menú per canviar/afegir; engranatge a Configuració. */
function AccountZone() {
  const [open, setOpen] = useState(false)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const account = selectedAccount.value
  const name = account?.displayName ?? '—'
  const kind = account == null ? '' : account.type === 'microsoft' ? 'Microsoft' : t('ui.offlineLabel')

  return (
    <div>
      {open && (
        <Popover anchor={triggerRef.current} onClose={() => setOpen(false)} width={280}>
          <div style={{ padding: 'var(--space-2)', display: 'flex', flexDirection: 'column', gap: 2 }}>
          {accounts.value.map((a) => (
            <button key={a.uuid} type="button" class="nav-item" style={{ height: 48, width: '100%' }}
              aria-current={a.uuid === account?.uuid ? 'true' : undefined}
              onClick={() => { setOpen(false); void selectAccount(a.uuid).then(loadAccounts) }}>
              <Avatar name={a.displayName} />
              <span style={{ display: 'flex', flexDirection: 'column', lineHeight: 1.2, minWidth: 0 }}>
                <b class="small" style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{a.displayName}</b>
                <span class="xs faint">{a.type === 'microsoft' ? 'Microsoft' : t('ui.offlineLabel')}</span>
              </span>
            </button>
          ))}
          <button type="button" class="nav-item" style={{ width: '100%' }} onClick={() => { setOpen(false); navigate('/settings/account') }}>
            <Plus size={20} /><span>{t('ui.addAccount')}</span>
          </button>
          </div>
        </Popover>
      )}
      <div class="account">
        <button ref={triggerRef} type="button" onClick={() => setOpen((v) => !v)} title={name} aria-label={t('ui.switchAccount')}
          style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)', background: 'none', border: 0, padding: 0, cursor: 'pointer', minWidth: 0, flex: 1, textAlign: 'left' }}>
          <Avatar name={name} />
          <div class="who"><b>{name}</b><span class="muted xs">{kind}</span></div>
        </button>
        <button type="button" class={`icon-btn${route.value.name === 'settings' ? ' current' : ''}`} title={t('nav.settings')} aria-label={t('nav.settings')} onClick={() => navigate('/settings')}>
          <Settings size={18} />
        </button>
      </div>
    </div>
  )
}

/**
 * 06 §7 / 08 §8: barra de títol pròpia + barra lateral (navegació, tasca activa, socials, compte) +
 * contingut routejat. Estructura i classes del prototip (`docs/client-redesign/prototype`).
 */
export function Shell({ children }: { children: ComponentChildren }) {
  // 06 §7: `Ctrl/Cmd+,` obre Configuració; `Ctrl/Cmd+1..4` canvia de pestanya.
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (!(e.ctrlKey || e.metaKey) || e.altKey || e.shiftKey) return
      const target = e.target as HTMLElement | null
      if (target != null && /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName) && e.key !== ',') return
      if (e.key === ',') { e.preventDefault(); navigate('/settings'); return }
      const index = Number.parseInt(e.key, 10)
      if (index >= 1 && index <= NAV_ITEMS.length) { e.preventDefault(); navigate(`/${NAV_ITEMS[index - 1].name}`) }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [])

  return (
    <div class={`app-shell${sidebarCollapsed.value ? ' sidebar-collapsed' : ''}`}>
      <div class="titlebar">
        <div class="brand"><BrandFlame size={20} /><span>HellMC</span></div>
        <div class="spacer" />
      </div>
      <div class="shell">
        <aside class="sidebar">
          <nav class="nav" aria-label={t('nav.ariaLabel')}>
            {NAV_ITEMS.map(({ name, labelKey, Icon }) => (
              <button
                key={name}
                type="button"
                class="nav-item"
                aria-current={route.value.name === name ? 'page' : undefined}
                title={t(labelKey)}
                aria-label={t(labelKey)}
                onClick={() => navigate(`/${name}`)}
              >
                <Icon size={20} />
                <span class="nav-label">{t(labelKey)}</span>
                {name === 'news' && unreadCount.value > 0 && <span class="badge">{unreadCount.value}</span>}
              </button>
            ))}
          </nav>
          <div class="sb-spacer" />
          <TaskIndicator />
          <InstancesIndicator />
          <div class="social" aria-label={t('ui.social')}>
            <button type="button" class="icon-btn" title="Discord" aria-label="Discord" onClick={() => void hellmc.system.openExternal(LINKS.discord)}><MessageCircle size={18} /></button>
            <button type="button" class="icon-btn" title={t('nav.website')} aria-label={t('nav.website')} onClick={() => void hellmc.system.openExternal(LINKS.website)}><Globe size={18} /></button>
          </div>
          <MinecraftStatus />
          <AccountZone />
        </aside>
        <main class="content">
          <div class="page">
            {!online.value && <Banner tone="warn">{t('network.offline')}</Banner>}
            {sessionInvalid.value && (
              <Banner tone="warn" action={<Button size="sm" variant="primary" onClick={() => navigate('/settings/account')}>{t('home.authInvalidAction')}</Button>}>
                {t('network.sessionInvalid')}
              </Banner>
            )}
            {children}
          </div>
        </main>
      </div>
    </div>
  )
}
