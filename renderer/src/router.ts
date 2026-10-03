import { signal } from '@preact/signals'

// Router hash mínim (06 §7). Només les rutes de nivell superior de moment (2.0); `:id` es
// suporta a `params` perquè `#/servers/:id`/`#/versions/:id` (2.2/2.3) no calgui tocar això.
export type RouteName = 'home' | 'servers' | 'versions' | 'news' | 'settings'

export interface Route {
  name: RouteName
  params: Record<string, string>
}

function parseHash(hash: string): Route {
  const path = hash.replace(/^#\/?/, '')
  const [first, second] = path.split('/').filter(Boolean)

  switch (first) {
    case 'servers':
      return { name: 'servers', params: second ? { id: second } : {} }
    case 'versions':
      return { name: 'versions', params: second ? { id: second } : {} }
    case 'news':
      return { name: 'news', params: {} }
    case 'settings':
      return { name: 'settings', params: { section: second ?? 'account' } }
    case 'home':
    default:
      return { name: 'home', params: {} }
  }
}

export const route = signal<Route>(parseHash(location.hash))

window.addEventListener('hashchange', () => {
  route.value = parseHash(location.hash)
})

export function navigate(path: string): void {
  location.hash = path.startsWith('#') ? path : `#${path}`
}
