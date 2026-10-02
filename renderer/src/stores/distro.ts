import type { Distribution } from 'hellmc-distribution-types'
import { signal } from '@preact/signals'
import { hellmc } from '../api'

// 06 §6, store `distro`: la distribució carregada (real des de 2.1, `hellmc.distro.get()` —
// `DistroAPI` compartit amb l'app antiga, veure `11-progres-fase2.md` §6). Cap component hi
// escriu directament — sempre a través de `loadDistro`/`refreshDistro`.

export const distro = signal<Distribution | null>(null)
export const distroLoading = signal(true)
export const distroError = signal<string | null>(null)

/** Es crida un cop en arrencar (`main.tsx`). */
export async function loadDistro(): Promise<void> {
  distroLoading.value = true
  distroError.value = null
  try {
    distro.value = await hellmc.distro.get()
  } catch (err) {
    distroError.value = err instanceof Error ? err.message : String(err)
  } finally {
    distroLoading.value = false
  }
}

/** Refresc explícit (p.ex. abans de Jugar, o botó manual) — no bloqueja mostrant la distro
 * anterior mentre arriba la nova. */
export async function refreshDistro(): Promise<void> {
  try {
    const { distribution } = await hellmc.distro.refresh()
    distro.value = distribution
    distroError.value = null
  } catch (err) {
    distroError.value = err instanceof Error ? err.message : String(err)
  }
}
