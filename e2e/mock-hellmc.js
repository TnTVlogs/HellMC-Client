// Es carrega al navegador ABANS de l'app (`page.addInitScript`). Substitueix `window.hellmc` (el pont d'Electron) per un
// doble de prova: cap Electron, cap joc, cap compte Microsoft, cap xarxa. Totes les crides queden registrades a
// `window.__e2e.calls` i les proves poden emetre esdeveniments (`window.__e2e.emit('launch.onProgress', {...})`).
//
// Qualsevol mètode no definit explícitament respon `undefined` (promesa resolta) i qualsevol `onXxx` retorna un
// «unsubscribe» buit, igual que el `stub` de les proves de component (renderer/tests/setup.ts).
;(() => {
  const fixtures = {
    'config.get': { ui: { theme: 'dark', performance: false, uiScale: 100, sidebarCollapsed: false, language: 'en', devMode: false } },
    'legal.get': { currentVersion: 1, termsAcceptedVersion: 1, acceptedAt: '2026-01-01T00:00:00Z', telemetryOptIn: false },
    'auth.accounts': { accounts: [{ type: 'offline', uuid: 'e2e-uuid', displayName: 'Steve' }], selectedUuid: 'e2e-uuid' },
    'selection.get': { serverId: null, versionId: null },
    'distro.get': {
      format: 2,
      versions: [{ id: 'v-e2e', name: 'E2E 1.20.1' }],
      servers: [{ id: 'srv-e2e', name: 'Servidor E2E', description: 'Servidor de proves', address: 'e2e.example.org', mainServer: true, tags: ['a', 'b', 'c', 'd'], versions: [{ id: 'v-e2e', recommended: true }] }]
    },
    'versions.status': { installed: true, needsUpdate: false, sizeBytes: 0, path: '/e2e' },
    'news.getArchive': { items: [], sources: [], fromCache: false, fetchedAt: null },
    'instances.list': [],
    'status.ping': { online: true, players: { online: 3, max: 20 }, latencyMs: 25 },
    'status.minecraft': { services: [{ id: 'auth', ok: true }, { id: 'services', ok: true }, { id: 'session', ok: true }] },
    'system.memory': { totalMb: 16384, freeMb: 8192 },
    'system.isClientOutdated': false
  }
  const props = { 'system.platform': 'win32', 'system.appVersion': '0.0.0-e2e' }

  const calls = []
  const listeners = {}
  const e2e = {
    calls,
    emit(path, payload) { for (const cb of listeners[path] ?? []) cb(payload) },
    callsTo(path) { return calls.filter((c) => c.path === path) }
  }
  window.__e2e = e2e

  function node(path) {
    const full = path.join('.')
    const fn = (...args) => {
      const name = path[path.length - 1] ?? ''
      calls.push({ path: full, args })
      if (/^on[A-Z]/.test(name)) {
        const cb = args[0]
        ;(listeners[full] ??= []).push(cb)
        return () => { listeners[full] = (listeners[full] ?? []).filter((x) => x !== cb) }
      }
      return Promise.resolve(full in fixtures ? structuredClone(fixtures[full]) : undefined)
    }
    return new Proxy(fn, {
      get(_t, prop) {
        if (prop === 'then' || typeof prop === 'symbol') return undefined
        const next = [...path, prop].join('.')
        if (next in props) return props[next]
        return node([...path, prop])
      }
    })
  }
  window.hellmc = node([])
})()
