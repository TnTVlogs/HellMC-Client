import { signal } from '@preact/signals'
import { hellmc, type SocialEvent, type SocialSnapshot, type SocialState, type SocialStatus } from '../api'
import { t } from '../i18n'
import { showToast } from './toasts'

// Amics (docs/pendents/plans/11-social-f4.md): el procés principal manté la connexió al relay i ens envia l'estat sencer a cada canvi;
// aquí només es guarda i s'hi fan accions. Cap component escriu aquests signals directament.

const EMPTY: SocialState = { phase: 'off', enabled: false, me: null, friends: [], incoming: [], outgoing: [], blocked: [], error: null }

/** L'usuari ha activat Amics (consentiment). */
export const socialConsent = signal(false)
/** El compte seleccionat és Microsoft. */
export const socialAvailable = signal(false)
export const social = signal<SocialState>(EMPTY)
export const socialLoaded = signal(false)
/** Últim missatge d'error ja traduït (accions), o `null`. */
export const socialError = signal<string | null>(null)
export const socialBusy = signal(false)

function applySnapshot(s: SocialSnapshot): void {
  socialConsent.value = s.consent
  socialAvailable.value = s.available
  social.value = s.state
}

/** `SOCIAL_ERROR:<CODI>` (procés principal) → text traduït. */
function errorMessage(err: unknown): string {
  const message = err instanceof Error ? err.message : String(err)
  const match = /SOCIAL_ERROR:([A-Z_]+)/.exec(message)
  return t(`friends.errors.${match != null ? match[1] : 'UNKNOWN'}`)
}

function onEvent(e: SocialEvent): void {
  if (e.kind === 'request') showToast(t('friends.events.request', { name: e.name }), { tone: 'info' })
  else if (e.kind === 'accepted') showToast(t('friends.events.accepted', { name: e.name }), { tone: 'ok' })
  else if (e.kind === 'online') showToast(t('friends.events.online', { name: e.name }), { tone: 'info', duration: 3000 })
}

let started = false

/** Es crida un cop en arrencar: carrega l'estat i es subscriu als canvis i als esdeveniments (avisos). */
export async function initSocial(): Promise<void> {
  if (!started) {
    started = true
    hellmc.social.onState((state) => { social.value = state })
    hellmc.social.onEvent(onEvent)
  }
  try {
    applySnapshot(await hellmc.social.state())
  } catch (err) {
    console.error('[renderer] social state failed', err)
  } finally {
    socialLoaded.value = true
  }
}

/** Activa Amics (amb el consentiment ja donat a la pantalla d'avís) o el posa en pausa. */
export async function setSocialEnabled(value: boolean): Promise<void> {
  socialError.value = null
  socialBusy.value = true
  try {
    applySnapshot(await hellmc.social.enable(value))
  } catch (err) {
    socialError.value = errorMessage(err)
  } finally {
    socialBusy.value = false
  }
}

/** Executa una acció contra el relay. Retorna el resultat (`sent`, `not_found`…) o `null` si ha fallat (l'error queda a `socialError`). */
export async function socialAct(op: string, payload?: Record<string, unknown>): Promise<unknown> {
  socialError.value = null
  socialBusy.value = true
  try {
    const result = await hellmc.social.act(op, payload)
    if (op === 'delete' && result === 'ok') applySnapshot(await hellmc.social.state())
    return result
  } catch (err) {
    socialError.value = errorMessage(err)
    return null
  } finally {
    socialBusy.value = false
  }
}

export function setSocialStatus(status: SocialStatus): Promise<unknown> {
  return socialAct('settings', { status })
}
