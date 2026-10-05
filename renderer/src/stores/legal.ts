import type { LegalState } from '../api'
import { computed, signal } from '@preact/signals'
import { hellmc } from '../api'

// D15/D8: acceptació dels termes i de la política de privacitat (versionada) i consentiment de telemetria, que és **separat**
// (mai empaquetat amb els termes, RGPD). Cap component hi escriu directament — sempre via aquestes accions.

export const legal = signal<LegalState | null>(null)
export const legalLoaded = signal(false)

/** Cal mostrar la pantalla de termes: mai acceptats o la versió acceptada és anterior a l'actual. */
export const needsTerms = computed(() => {
  const state = legal.value
  return state != null && (state.termsAcceptedVersion == null || state.termsAcceptedVersion < state.currentVersion)
})

/** Ja havia acceptat una versió anterior (els termes s'han actualitzat) — canvia el missatge de la pantalla. */
export const termsUpdated = computed(() => legal.value?.termsAcceptedVersion != null)

export async function loadLegal(): Promise<void> {
  try {
    legal.value = await hellmc.legal.get()
  } finally {
    legalLoaded.value = true
  }
}

export async function acceptTerms(telemetryOptIn: boolean): Promise<void> {
  await hellmc.legal.accept(telemetryOptIn)
  await loadLegal()
}

export async function setTelemetry(value: boolean): Promise<void> {
  await hellmc.legal.setTelemetry(value)
  await loadLegal()
}
