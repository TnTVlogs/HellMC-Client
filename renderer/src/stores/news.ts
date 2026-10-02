import { computed, signal } from '@preact/signals'
import { hellmc, type NewsArchiveItem, type NewsSource } from '../api'

// 06 §6, store `news` (07 §5): un sol lloc que sap l'estat de l'arxiu de notícies — `main.tsx` el
// carrega un cop en arrencar (com `loadUiConfig`) perquè el comptador de la barra lateral tingui
// dades sense que el jugador hagi d'obrir la pestanya Notícies primer. La vista `News.tsx` només
// llegeix aquest store i crida `markRead()` en muntar-se, mai fa el seu propi fetch en paral·lel.

export const items = signal<NewsArchiveItem[]>([])
export const sources = signal<NewsSource[]>([])
export const fromCache = signal(false)
export const fetchedAt = signal<number | null>(null)
export const loading = signal(false)

export const unreadCount = computed(() => items.value.filter((i) => i.unread).length)

export async function loadArchive(): Promise<void> {
  loading.value = true
  try {
    const archive = await hellmc.news.getArchive()
    items.value = archive.items
    sources.value = archive.sources
    fromCache.value = archive.fromCache
    fetchedAt.value = archive.fetchedAt
  } finally {
    loading.value = false
  }
}

// Optimista: neteja `unread` localment de seguida (el comptador de la barra baixa a l'instant) en
// comptes d'esperar un `loadArchive()` sencer només per confirmar el que ja sabem que ha passat.
export async function markRead(): Promise<void> {
  await hellmc.news.markRead()
  items.value = items.value.map((i) => (i.unread ? { ...i, unread: false } : i))
}
