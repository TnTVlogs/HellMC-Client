import { useState } from 'preact/hooks'
import { Info, User, Wifi } from 'lucide-preact'
import { t } from '../i18n'
import { Button } from '../components/Button'
import { BrandFlame } from '../components/BrandFlame'
import { Banner } from '../components/ui'
import { hellmc } from '../api'
import { language, setLanguage, theme, setTheme } from '../stores/ui'
import { authErrorMessage } from '../utils/authError'
import { addOfflineAccount, loadAccounts } from '../stores/account'

// 07 §8.2/§8.3 (`prototype/welcome.html`): benvinguda → login (Microsoft | offline). Quan hi ha un
// compte, `App` passa sol a Inici (la selecció D18 ja la fa `loadSelection`).
type Step = 'welcome' | 'login' | 'offline' | 'waiting'

const USERNAME_RE = /^[A-Za-z0-9_]{3,16}$/

function Steps({ n }: { n: 1 | 2 | 3 }) {
  return <div class="steps" aria-hidden="true"><i class="on" /><i class={n >= 2 ? 'on' : ''} /><i class={n >= 3 ? 'on' : ''} /></div>
}

function MsLogo() {
  return <span class="ms" aria-hidden="true"><i /><i /><i /><i /></span>
}

export function Welcome() {
  const [step, setStep] = useState<Step>('welcome')
  const [username, setUsername] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function loginMicrosoft() {
    setError(null)
    setStep('waiting')
    try {
      await hellmc.auth.addMicrosoft()
      await loadAccounts()
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      // «cancelled»: l'usuari ha tancat la finestra, no és un error a mostrar.
      if (message !== 'cancelled') setError(authErrorMessage(err))
      setStep('login')
    }
  }

  async function playOffline(event: Event) {
    event.preventDefault()
    const name = username.trim()
    if (!USERNAME_RE.test(name)) {
      setError(t('welcome.invalidUsername'))
      return
    }
    setBusy(true)
    setError(null)
    try {
      await addOfflineAccount(name)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
      setBusy(false)
    }
  }

  const languages = [['ca', 'Català'], ['es', 'Español'], ['en', 'English']] as const
  const themes = [
    ['system', t('welcome.themeSystem')], ['dark', t('welcome.themeDark')], ['light', t('welcome.themeLight')]
  ] as const

  return (
    <div class="app-shell" style={{ gridTemplateRows: 'minmax(0, 1fr)' }}>
      <div class="center-drag" />
      <main class="center-screen">
        {step === 'welcome' && (
          <section class="card welcome" aria-labelledby="w-title">
            <Steps n={1} />
            <div class="logo"><BrandFlame size={40} /></div>
            <div><h1 id="w-title">{t('welcome.title')}</h1><p class="muted" style={{ marginTop: 8 }}>{t('welcome.subtitle')}</p></div>
            <div class="row">
              <div class="field-row" style={{ textAlign: 'left' }}>
                <label for="w-lang">{t('welcome.language')}</label>
                <select id="w-lang" class="field" value={language.value} onChange={(e) => setLanguage((e.target as HTMLSelectElement).value as (typeof languages)[number][0])}>
                  {languages.map(([code, label]) => <option key={code} value={code}>{label}</option>)}
                </select>
              </div>
              <div class="field-row" style={{ textAlign: 'left' }}>
                <label>{t('welcome.theme')}</label>
                <div class="seg" data-role="theme">
                  {themes.map(([code, label]) => <button key={code} type="button" aria-pressed={theme.value === code} onClick={() => setTheme(code)}>{label}</button>)}
                </div>
              </div>
            </div>
            <Button variant="primary" size="lg" onClick={() => setStep('login')}>{t('welcome.start')}</Button>
          </section>
        )}

        {step === 'login' && (
          <section class="card welcome" aria-labelledby="w-title">
            <Steps n={2} />
            <div><h1 id="w-title" style={{ fontSize: 'var(--fs-xl)' }}>{t('welcome.loginTitle')}</h1><p class="muted" style={{ marginTop: 8 }}>{t('welcome.loginSubtitle')}</p></div>
            <button type="button" class="ms-btn" onClick={() => void loginMicrosoft()}><MsLogo /> {t('welcome.microsoftContinue')}</button>
            <p class="muted small">{t('welcome.microsoftHint')}</p>
            {error != null && <Banner tone="warn" icon={Info}>{error}</Banner>}
            <button type="button" class="link-btn" onClick={() => { setError(null); setStep('offline') }}>{t('welcome.offlineLink')}</button>
          </section>
        )}

        {step === 'offline' && (
          <form class="card welcome" aria-labelledby="w-title" onSubmit={(e) => void playOffline(e)}>
            <Steps n={2} />
            <div class="logo" style={{ width: 56, height: 56, borderRadius: 16 }}><User size={28} /></div>
            <div><h1 id="w-title" style={{ fontSize: 'var(--fs-xl)' }}>{t('welcome.offlineTitle')}</h1><p class="muted" style={{ marginTop: 8 }}>{t('welcome.offlineSubtitle')}</p></div>
            <div class="field-row">
              <label for="w-username">{t('welcome.offlineUsername')}</label>
              <input id="w-username" class="field" maxLength={16} autoFocus value={username} onInput={(e) => setUsername((e.target as HTMLInputElement).value)} />
            </div>
            {error != null && <Banner tone="warn" icon={Info}>{error}</Banner>}
            <Button type="submit" variant="primary" size="lg" disabled={busy || username.trim() === ''}>{t('welcome.offlinePlay')}</Button>
            <p class="muted small"><Wifi size={14} style={{ verticalAlign: '-2px' }} /> {t('welcome.offlineHint')}</p>
            <button type="button" class="link-btn" onClick={() => { setError(null); setStep('login') }}>{t('welcome.microsoftLink')}</button>
          </form>
        )}

        {step === 'waiting' && (
          <section class="card welcome" aria-labelledby="w-title" aria-busy="true">
            <Steps n={2} />
            <div class="spinner" role="status" />
            <div><h1 id="w-title" style={{ fontSize: 'var(--fs-xl)' }}>{t('welcome.waitingTitle')}</h1><p class="muted" style={{ marginTop: 8 }}>{t('welcome.waitingBody')}</p></div>
            <Button variant="ghost" onClick={() => setStep('login')}>{t('welcome.cancel')}</Button>
          </section>
        )}
      </main>
    </div>
  )
}
