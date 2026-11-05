import { useEffect, useState } from 'preact/hooks'
import { signal } from '@preact/signals'
import { hellmc, type PendingErrorPrompt } from '../api'
import { t } from '../i18n'
import { Button } from './Button'
import { useFocusTrap } from './useFocusTrap'

/** Informe greu de l'última vegada pendent de preguntar (plans/08 §3). El procés principal només el lliura un cop per arrencada. */
export const pendingErrorPrompt = signal<PendingErrorPrompt | null>(null)
let asked = false

/** Demana l'informe pendent (un cop per execució del renderer). Mai llança: sense informe, no hi ha diàleg. */
export async function loadErrorPrompt(): Promise<void> {
  if (asked) return
  asked = true
  try {
    pendingErrorPrompt.value = (await hellmc.errors.getPendingPrompt()) ?? null
  } catch (err) {
    console.error('[renderer] error prompt failed', err)
  }
}

/** Només per a proves: torna a permetre la consulta. */
export function resetErrorPrompt(): void {
  asked = false
  pendingErrorPrompt.value = null
}

/**
 * Diàleg de fallada greu: «L'última vegada HellMC s'ha tancat amb un error». Res no s'envia sense prémer «Envia l'informe»;
 * «Veure què s'envia» ensenya el JSON net exacte i «No ho tornis a preguntar» desactiva el diàleg per sempre.
 */
export function ErrorReportPrompt() {
  const trapRef = useFocusTrap<HTMLDivElement>()
  const [showing, setShowing] = useState(false)
  const [busy, setBusy] = useState(false)
  useEffect(() => { void loadErrorPrompt() }, [])

  const prompt = pendingErrorPrompt.value
  if (prompt == null) return null

  async function answer(choice: 'send' | 'dismiss' | 'never') {
    setBusy(true)
    try {
      await hellmc.errors.answerPrompt(choice)
    } catch (err) {
      console.error('[renderer] error prompt answer failed', err)
    } finally {
      pendingErrorPrompt.value = null
      setBusy(false)
    }
  }

  return (
    <div class="dialog-host">
      <div ref={trapRef} class="card dialog" role="alertdialog" tabIndex={-1} aria-modal="true" aria-labelledby="error-prompt-title" style={{ width: 'min(560px, 100%)' }}>
        <h2 id="error-prompt-title">{t('errorPrompt.title')}</h2>
        <p class="muted">{t('errorPrompt.body')}</p>
        <div>
          <Button variant="ghost" size="sm" aria-expanded={showing} onClick={() => setShowing((v) => !v)}>
            {showing ? t('errorPrompt.hide') : t('errorPrompt.show')}
          </Button>
        </div>
        {showing && (
          <pre
            aria-label={t('errorPrompt.previewLabel')}
            data-testid="error-prompt-json"
            style={{ maxHeight: 240, overflow: 'auto', fontSize: 12, userSelect: 'text', whiteSpace: 'pre-wrap', wordBreak: 'break-word', margin: 0 }}
          >{prompt.json}</pre>
        )}
        <div class="actions">
          <Button variant="ghost" disabled={busy} onClick={() => void answer('never')}>{t('errorPrompt.never')}</Button>
          <Button variant="secondary" disabled={busy} onClick={() => void answer('dismiss')}>{t('errorPrompt.skip')}</Button>
          <Button variant="primary" disabled={busy} onClick={() => void answer('send')}>{t('errorPrompt.send')}</Button>
        </div>
      </div>
    </div>
  )
}
