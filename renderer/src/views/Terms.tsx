import { useState } from 'preact/hooks'
import { Info } from 'lucide-preact'
import { t } from '../i18n'
import { Button } from '../components/Button'
import { BrandFlame } from '../components/BrandFlame'
import { Banner } from '../components/ui'
import { hellmc } from '../api'
import { legalLink } from '../links'
import { language, setLanguage } from '../stores/ui'
import { acceptTerms, termsUpdated } from '../stores/legal'

const LANGUAGES = [['ca', 'Català'], ['es', 'Español'], ['en', 'English']] as const

function ExtLink({ href, children }: { href: string; children: string }) {
  return <a href={href} onClick={(e) => { e.preventDefault(); void hellmc.system.openExternal(href) }}>{children}</a>
}

/**
 * D15: pantalla de termes i privacitat. Surt en la primera execució **i** quan s'actualitzen els termes (també a qui ve de la
 * 1.2.2 amb la sessió ja iniciada: no hi ha login, només això). La telemetria és una casella **separada** i no marcada.
 */
export function Terms() {
  const [accepted, setAccepted] = useState(false)
  const [telemetry, setTelemetryChoice] = useState(false)
  const [busy, setBusy] = useState(false)
  const [failed, setFailed] = useState(false)

  async function submit(event: Event) {
    event.preventDefault()
    if (!accepted) return
    setBusy(true)
    setFailed(false)
    try {
      await acceptTerms(telemetry)
    } catch (err) {
      console.error('[terms] accept failed', err)
      setFailed(true)
      setBusy(false)
    }
  }

  return (
    <div class="app-shell" style={{ gridTemplateRows: 'minmax(0, 1fr)' }}>
      <div class="center-drag" />
      <main class="center-screen">
        <form class="card welcome terms" aria-labelledby="terms-title" onSubmit={(e) => void submit(e)}>
          <div class="logo"><BrandFlame size={40} /></div>
          <div>
            <h1 id="terms-title">{t('legal.title')}</h1>
            <p class="muted" style={{ marginTop: 8 }}>{termsUpdated.value ? t('legal.updated') : t('legal.intro')}</p>
          </div>

          <div class="field-row" style={{ textAlign: 'left' }}>
            <label for="terms-lang">{t('welcome.language')}</label>
            <select id="terms-lang" class="field" value={language.value} onChange={(e) => setLanguage((e.target as HTMLSelectElement).value as (typeof LANGUAGES)[number][0])}>
              {LANGUAGES.map(([code, label]) => <option key={code} value={code}>{label}</option>)}
            </select>
          </div>

          <p class="terms-links">
            <ExtLink href={legalLink('privacy', language.value)}>{t('legal.privacyLink')}</ExtLink>{' · '}<ExtLink href={legalLink('terms', language.value)}>{t('legal.termsLink')}</ExtLink>
          </p>

          <label class="check-row">
            <input type="checkbox" checked={accepted} onChange={(e) => setAccepted((e.target as HTMLInputElement).checked)} />
            <span>{t('legal.acceptLabel')}</span>
          </label>

          <label class="check-row">
            <input type="checkbox" checked={telemetry} onChange={(e) => setTelemetryChoice((e.target as HTMLInputElement).checked)} />
            <span><b>{t('legal.telemetryTitle')}</b><span class="muted small">{t('legal.telemetryHelp')}</span></span>
          </label>

          {failed && <Banner tone="warn" icon={Info}>{t('boot.errorBody')}</Banner>}

          <div class="terms-actions">
            <Button type="submit" variant="primary" size="lg" disabled={!accepted || busy}>{t('legal.continue')}</Button>
            <Button type="button" variant="ghost" size="sm" onClick={() => hellmc.window.close()}>{t('legal.quit')}</Button>
          </div>
          <p class="muted xs terms-note">{t('legal.notOfficial')}</p>
        </form>
      </main>
    </div>
  )
}
