// Stub de `window.hellmc` (06 §11): els stores el llegeixen en importar-se; a les proves cada mètode
// és una funció que resol a `undefined`, i les subscripcions retornen un `unsubscribe` buit.
// Les proves poden substituir un mètode concret (`overrideHellmc('launch.onProgress', fn)`) perquè
// l'objecte exportat per `api.ts` és aquest proxy i consulta el mapa a cada accés.
const overrides = new Map<string, unknown>()
export function overrideHellmc(path: string, value: unknown): void { overrides.set(path, value) }
export function resetHellmcOverrides(): void { overrides.clear() }
;(globalThis as unknown as { __hellmcOverride: typeof overrideHellmc; __hellmcReset: typeof resetHellmcOverrides }).__hellmcOverride = overrideHellmc
;(globalThis as unknown as { __hellmcReset: typeof resetHellmcOverrides }).__hellmcReset = resetHellmcOverrides

function stub(path: string[] = []): unknown {
  const fn = () => undefined
  return new Proxy(fn, {
    get(_target, prop: string) {
      const full = [...path, prop].join('.')
      if (overrides.has(full)) return overrides.get(full)
      if (prop === 'then') return undefined // no és una Promise
      if (prop === 'platform') return 'win32'
      if (prop === 'appVersion') return '0.0.0-test'
      return stub([...path, prop])
    },
    apply(_target, _this, _args) {
      const name = path[path.length - 1] ?? ''
      if (/^on[A-Z]/.test(name)) return () => undefined // onProgress/onEvent/onChange → unsubscribe
      return Promise.resolve(name === 'get' && path[0] === 'config' ? { ui: {} } : undefined)
    }
  })
}

import '@testing-library/jest-dom/vitest'
import { cleanup } from '@testing-library/preact'
import { afterEach } from 'vitest'

afterEach(() => { cleanup(); resetHellmcOverrides() })

;(window as unknown as { hellmc: unknown }).hellmc = stub()

// jsdom no implementa `matchMedia` (el store `ui` el fa servir en importar-se).
window.matchMedia = ((query: string) => ({
  matches: false,
  media: query,
  addEventListener: () => undefined,
  removeEventListener: () => undefined,
  addListener: () => undefined,
  removeListener: () => undefined,
  dispatchEvent: () => false,
  onchange: null
})) as unknown as typeof window.matchMedia
