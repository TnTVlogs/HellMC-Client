import { computed, effect, signal } from '@preact/signals'
import { hellmc } from '../api'

// 06 §6, store `ui`: `theme`, `performance`, `uiScale`, `sidebarCollapsed`, `language`,
// persistit a `config.json` (de moment via el mock de `window.hellmc.config`). Cap component hi
// escriu directament — sempre a través de les accions d'aquest fitxer.

export type Theme = 'system' | 'dark' | 'light'
export type PerformanceMode = 'auto' | 'on' | 'off'
export type Language = 'en' | 'es' | 'ca'

function detectLanguage(): Language {
  const nav = navigator.language.slice(0, 2)
  return nav === 'es' || nav === 'ca' ? nav : 'en'
}

export const theme = signal<Theme>('system')
export const perfMode = signal<PerformanceMode>('auto')
export const uiScale = signal<number>(100)
export const sidebarCollapsed = signal<boolean>(false)
export const language = signal<Language>(detectLanguage())
/** 07 §6 «Launcher»: persisteix igual de normal; la UI que el mostra es manté amagada fins que
 * es desbloqueja (Sobre, clicar la versió uns quants cops, `views/settings/AboutSection.tsx`). */
export const devMode = signal<boolean>(false)
/** Només de sessió (mai `config.json`): un cop clicada la versió prou vegades a Sobre, el
 * interruptor de `devMode` apareix a Launcher per a la resta de la sessió — tornar a obrir l'app
 * torna a amagar-lo (sense desbloquejar, el valor de `devMode` en si no es toca). */
export const devModeRevealed = signal<boolean>(false)

/** 08 §9 criteri (b): maquinari fluix si <= 4 nuclis lògics i <= 4 GB de RAM total. Es calcula un
 * cop en arrencar (no canvia en calent) i només s'aplica quan `perfMode` és `auto`. */
export const lowEndHardware = signal(false)

async function detectLowEndHardware(): Promise<void> {
  const { totalMb } = await hellmc.system.memory()
  lowEndHardware.value = navigator.hardwareConcurrency <= 4 && totalMb <= 4096
}

let loaded = false

/** Es crida un cop en arrencar (`main.tsx`). No bloqueja el primer render: els signals ja tenen
 * valors per defecte raonables i es corregeixen quan `config.get()` respon. */
export async function loadUiConfig(): Promise<void> {
  await detectLowEndHardware()
  const config = await hellmc.config.get()
  theme.value = config.ui.theme
  perfMode.value = config.ui.performance
  uiScale.value = config.ui.uiScale
  sidebarCollapsed.value = config.ui.sidebarCollapsed
  language.value = config.ui.language
  devMode.value = config.ui.devMode
  loaded = true
}

function persist(): void {
  // No desar mentre no s'hagi carregat un cop: sinó, els valors per defecte d'aquest fitxer
  // sobreescriurien `config.json` abans que `loadUiConfig` l'hagi pogut llegir.
  if (!loaded) return
  void hellmc.config.set({
    ui: {
      theme: theme.value,
      performance: perfMode.value,
      uiScale: uiScale.value,
      sidebarCollapsed: sidebarCollapsed.value,
      language: language.value,
      devMode: devMode.value
    }
  })
}

export function setTheme(next: Theme): void {
  theme.value = next
  persist()
}

export function setPerfMode(next: PerformanceMode): void {
  perfMode.value = next
  persist()
}

export function setLanguage(next: Language): void {
  language.value = next
  persist()
}

export function setUiScale(next: number): void {
  uiScale.value = next
  persist()
}

export function setSidebarCollapsed(next: boolean): void {
  sidebarCollapsed.value = next
  persist()
}

export function setDevMode(next: boolean): void {
  devMode.value = next
  persist()
}

// 08 §2: `data-theme` a `<html>` (absent = segueix `prefers-color-scheme` via el CSS de 08 §11).
effect(() => {
  if (theme.value === 'system') {
    delete document.documentElement.dataset.theme
  } else {
    document.documentElement.dataset.theme = theme.value
  }
})

// 08 §8.2: quin dels dos temes s'aplica de veritat ('system' resol contra el SO). Reactiu als dos
// costats: canviar `theme` i canviar el tema del SO mentre `theme` és 'system'.
const darkMediaQuery = window.matchMedia('(prefers-color-scheme: dark)')
const systemPrefersDark = signal(darkMediaQuery.matches)
darkMediaQuery.addEventListener('change', (event) => {
  systemPrefersDark.value = event.matches
})

export const effectiveTheme = computed<'dark' | 'light'>(() =>
  theme.value === 'system' ? (systemPrefersDark.value ? 'dark' : 'light') : theme.value
)

// Recolora els botons natius de finestra (`titleBarOverlay`) perquè no es quedin fixats al tema
// d'arrencada (reportat: botons foscos amb tema clar seleccionat).
effect(() => {
  hellmc.window.setTitleBarOverlay(effectiveTheme.value)
})

// 08 §11: diàlegs i menús natius segueixen el tema de l'app (`nativeTheme.themeSource`).
effect(() => {
  hellmc.window.setNativeTheme(theme.value)
})

// 08 §9: `data-perf="low"` quan `perfMode` és `on`, o `auto` i (maquinari fluix o
// `prefers-reduced-motion`).
effect(() => {
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches
  const low = perfMode.value === 'on' || (perfMode.value === 'auto' && (lowEndHardware.value || reducedMotion))
  if (low) {
    document.documentElement.dataset.perf = 'low'
  } else {
    delete document.documentElement.dataset.perf
  }
})

// 08 §6.4: `uiScale` (85/100/115/130%) canvia `html { font-size }`; tot està en `rem`.
effect(() => {
  document.documentElement.style.fontSize = `${uiScale.value}%`
})
