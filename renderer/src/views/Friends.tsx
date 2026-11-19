import { useEffect, useState } from 'preact/hooks'
import { Ban, Check, Copy, Download, Info, Pause, Trash2, UserMinus, UserPlus, X } from 'lucide-preact'
import { t } from '../i18n'
import { hellmc, type SocialFriend, type SocialPerson, type SocialStatus } from '../api'
import { legalLink } from '../links'
import { language } from '../stores/ui'
import { Button } from '../components/Button'
import { ConfirmDialog } from '../components/ConfirmDialog'
import { Select } from '../components/Select'
import { Toggle } from '../components/Toggle'
import { Banner, Avatar, StatusDot } from '../components/ui'
import { showToast } from '../stores/toasts'
import { selectedAccount } from '../stores/account'
import { probeSocial, social, socialAct, socialAvailable, socialBusy, socialConsent, socialError, setSocialEnabled, setSocialStatus } from '../stores/social'

// docs/pendents/plans/11-social-f4.md i docs/client-cosmetics/10-mod-social.md: llista d'amics, estat, sol·licituds i dades pròpies.
// Tot és opt-in: la primera vegada es mostra l'avís de privacitat i només es connecta al relay quan l'usuari l'accepta.

const NAME_RE = /^[A-Za-z0-9_]{1,16}$/
const CODE_RE = /^[A-HJKMNP-Za-hjkmnp-z2-9]{8}$/

function Dot({ f }: { f: SocialFriend }) {
  return <StatusDot state={f.status === 'online' ? 'on' : f.status === 'busy' ? 'warn' : 'off'} />
}

function where(f: SocialFriend): string {
  if (!f.online) return t('friends.offline')
  if (f.server != null) return t('friends.playingOn', { server: f.server })
  if (f.serverPrivate === true) return t('friends.privateServer')
  return f.status === 'busy' ? t('friends.busy') : t('friends.online')
}

function Consent() {
  const busy = socialBusy.value
  const [accepted, setAccepted] = useState(false)
  return (
    <section class="card pad" style={{ display: 'grid', gap: 'var(--space-3)', maxWidth: '680px' }}>
      <h2>{t('friends.consentTitle')}</h2>
      <p>{t('friends.consentIntro')}</p>
      <ul style={{ paddingLeft: '1.2em', display: 'grid', gap: 'var(--space-1)' }}>
        <li>{t('friends.consentPoint1')}</li>
        <li>{t('friends.consentPoint2')}</li>
        <li>{t('friends.consentPoint3')}</li>
        <li>{t('friends.consentPoint4')}</li>
      </ul>
      <label class="check-row">
        <input type="checkbox" checked={accepted} onChange={(e) => setAccepted((e.target as HTMLInputElement).checked)} />
        <span>{t('friends.consentTerms')} <ExtLink href={legalLink('privacy', language.value)}>{t('legal.privacyLink')}</ExtLink></span>
      </label>
      <div><Button variant="primary" disabled={busy || !accepted} onClick={() => void setSocialEnabled(true)}>{t('friends.consentAccept')}</Button></div>
    </section>
  )
}

function ExtLink({ href, children }: { href: string; children: string }) {
  return <a href={href} onClick={(e) => { e.preventDefault(); void hellmc.system.openExternal(href) }}>{children}</a>
}

function Person({ p, children }: { p: SocialPerson; children: preact.ComponentChildren }) {
  return (
    <div class="friend-row">
      <Avatar name={p.name} uuid={p.uuid} />
      <div class="friend-main"><b>{p.name}</b></div>
      <div class="friend-actions">{children}</div>
    </div>
  )
}

export function Friends() {
  const s = social.value
  const busy = socialBusy.value
  const account = selectedAccount.value
  const [query, setQuery] = useState('')
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [confirmBlock, setConfirmBlock] = useState<SocialPerson | null>(null)
  const [copied, setCopied] = useState(false)
  useEffect(() => { void probeSocial() }, [])

  async function add() {
    const q = query.trim()
    const payload = CODE_RE.test(q) || NAME_RE.test(q) ? { query: q } : null
    if (payload == null) { showToast(t('friends.invalidQuery'), { tone: 'warn' }); return }
    const result = await socialAct('add', payload)
    if (typeof result === 'string') {
      showToast(t(`friends.result.${result}`), { tone: result === 'sent' || result === 'accepted' ? 'ok' : 'warn' })
      if (result === 'sent' || result === 'accepted') setQuery('')
    }
  }

  async function exportData() {
    const data = await socialAct('export')
    if (data == null || typeof data !== 'object') return
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'hellmc-amics.json'
    a.click()
    setTimeout(() => URL.revokeObjectURL(url), 5000)
    showToast(t('friends.exported'), { tone: 'ok' })
  }

  async function copyCode(code: string) {
    try {
      await navigator.clipboard.writeText(code)
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch {
      /* sense porta-retalls: el codi segueix visible per copiar-lo a mà */
    }
  }

  const head = (
    <div class="page-head">
      <div class="grow"><h1>{t('nav.friends')}</h1><p>{t('friends.subtitle')}</p></div>
    </div>
  )

  if (account != null && !socialAvailable.value) {
    return <>{head}<Banner tone="info" icon={Info}>{t('friends.needMicrosoft')}</Banner></>
  }
  if (!socialConsent.value) {
    return <>{head}{socialError.value != null && <Banner tone="warn">{socialError.value}</Banner>}<Consent /></>
  }

  const me = s.me
  const statusOptions = [
    { value: 'online', label: t('friends.statusOnline') },
    { value: 'busy', label: t('friends.statusBusy') },
    { value: 'invisible', label: t('friends.statusInvisible') }
  ]
  const online = s.friends.filter((f) => f.online)
  const offline = s.friends.filter((f) => !f.online)

  const friendRow = (f: SocialFriend) => (
    <div class="friend-row" key={f.uuid}>
      <Avatar name={f.name} uuid={f.uuid} />
      <div class="friend-main"><b>{f.name}</b><span class="muted small"><Dot f={f} /> {where(f)}</span></div>
      <div class="friend-actions">
        <Button size="sm" variant="ghost" disabled={busy} title={t('friends.remove')} aria-label={t('friends.remove')} onClick={() => void socialAct('remove', { uuid: f.uuid })}><UserMinus size={16} /></Button>
        <Button size="sm" variant="ghost" disabled={busy} title={t('friends.block')} aria-label={t('friends.block')} onClick={() => setConfirmBlock(f)}><Ban size={16} /></Button>
      </div>
    </div>
  )

  return (
    <>
      {head}
      {s.phase === 'connecting' && <Banner tone="info" icon={Info}>{t('friends.connecting')}</Banner>}
      {s.phase === 'error' && <Banner tone="warn">{t(`friends.error.${s.error ?? 'network'}`)}</Banner>}
      {socialError.value != null && <Banner tone="warn">{socialError.value}</Banner>}

      <div class="friends-grid">
        <section class="card pad friends-col" aria-label={t('friends.listTitle')}>
          <form class="friend-add" onSubmit={(e) => { e.preventDefault(); void add() }}>
            <input class="field" value={query} maxLength={16} placeholder={t('friends.addPlaceholder')} aria-label={t('friends.addTitle')}
              onInput={(e) => setQuery((e.target as HTMLInputElement).value)} />
            <Button size="sm" type="submit" variant="primary" disabled={busy || query.trim() === '' || s.phase !== 'online'}><UserPlus size={16} /> {t('friends.add')}</Button>
          </form>

          {s.incoming.length > 0 && (
            <div class="friends-block">
              <h3>{t('friends.requests')} <span class="muted">({s.incoming.length})</span></h3>
              {s.incoming.map((p) => (
                <Person key={p.uuid} p={p}>
                  <Button size="sm" variant="primary" disabled={busy} onClick={() => void socialAct('respond', { uuid: p.uuid, accept: true })}><Check size={16} /> {t('friends.accept')}</Button>
                  <Button size="sm" variant="ghost" disabled={busy} onClick={() => void socialAct('respond', { uuid: p.uuid, accept: false })}><X size={16} /> {t('friends.decline')}</Button>
                </Person>
              ))}
            </div>
          )}

          <div class="friends-block">
            <h3>{t('friends.listTitle')} <span class="muted">({s.friends.length})</span></h3>
            {s.friends.length === 0 && <p class="muted small">{t('friends.none')}</p>}
            {online.map(friendRow)}
            {offline.map(friendRow)}
          </div>

          {s.outgoing.length > 0 && (
            <div class="friends-block">
              <h3>{t('friends.sent')}</h3>
              {s.outgoing.map((p) => (
                <Person key={p.uuid} p={p}>
                  <Button size="sm" variant="ghost" disabled={busy} onClick={() => void socialAct('remove', { uuid: p.uuid })}>{t('friends.cancel')}</Button>
                </Person>
              ))}
            </div>
          )}

          {s.blocked.length > 0 && (
            <div class="friends-block">
              <h3>{t('friends.blocked')}</h3>
              {s.blocked.map((p) => (
                <Person key={p.uuid} p={p}>
                  <Button size="sm" variant="ghost" disabled={busy} onClick={() => void socialAct('unblock', { uuid: p.uuid })}>{t('friends.unblock')}</Button>
                </Person>
              ))}
            </div>
          )}
        </section>

        <section class="card pad friends-col" aria-label={t('friends.settingsTitle')}>
          <h3>{t('friends.yourCode')}</h3>
          {me != null
            ? <div class="friend-code"><code>{me.code}</code><Button size="sm" variant="ghost" onClick={() => void copyCode(me.code)}><Copy size={16} /> {copied ? t('friends.copied') : t('friends.copy')}</Button></div>
            : <p class="muted small">{t('friends.connecting')}</p>}
          <p class="muted small">{t('friends.codeHelp')}</p>

          {me != null && (
            <>
              <h3>{t('friends.settingsTitle')}</h3>
              <div class="friend-setting">
                <label for="friend-status">{t('friends.status')}</label>
                <Select id="friend-status" value={me.status} options={statusOptions} onChange={(v) => void setSocialStatus(v as SocialStatus)} />
              </div>
              <div class="friend-setting">
                <span>{t('friends.hideServer')}</span>
                <Toggle checked={me.hideServer} label={t('friends.hideServer')} onChange={(v) => void socialAct('settings', { hideServer: v })} />
              </div>
              <div class="friend-setting">
                <span>{t('friends.allowRequests')}</span>
                <Toggle checked={me.allowRequests === 'all'} label={t('friends.allowRequests')} onChange={(v) => void socialAct('settings', { allowRequests: v ? 'all' : 'none' })} />
              </div>
            </>
          )}

          <h3>{t('friends.dataTitle')}</h3>
          <p class="muted small">{t('friends.dataHelp')}</p>
          <div class="friend-data">
            <Button size="sm" disabled={busy} onClick={() => void setSocialEnabled(false)}><Pause size={16} /> {t('friends.pause')}</Button>
            <Button size="sm" disabled={busy || s.phase !== 'online'} onClick={() => void exportData()}><Download size={16} /> {t('friends.export')}</Button>
            <Button size="sm" variant="danger" disabled={busy || s.phase !== 'online'} onClick={() => setConfirmDelete(true)}><Trash2 size={16} /> {t('friends.delete')}</Button>
          </div>
        </section>
      </div>

      {confirmDelete && (
        <ConfirmDialog title={t('friends.deleteTitle')} message={t('friends.deleteMessage')} confirmLabel={t('friends.delete')} cancelLabel={t('friends.cancel')}
          onCancel={() => setConfirmDelete(false)} onConfirm={() => { setConfirmDelete(false); void socialAct('delete') }} />
      )}
      {confirmBlock != null && (
        <ConfirmDialog title={t('friends.blockTitle', { name: confirmBlock.name })} message={t('friends.blockMessage')} confirmLabel={t('friends.block')} cancelLabel={t('friends.cancel')}
          onCancel={() => setConfirmBlock(null)} onConfirm={() => { const p = confirmBlock; setConfirmBlock(null); void socialAct('block', { uuid: p.uuid }) }} />
      )}
    </>
  )
}
