// Stub de `window.hellmc` (06 §11): els stores el llegeixen en importar-se; a les proves cada mètode
// és una funció que resol a `undefined`, i les subscripcions retornen un `unsubscribe` buit.
function stub(path: string[] = []): unknown {
  const fn = () => undefined
  return new Proxy(fn, {
    get(_target, prop: string) {
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
