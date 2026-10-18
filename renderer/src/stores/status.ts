import { signal } from '@preact/signals'
import { hellmc } from '../api'
import { online } from './network'

// 06 §6, store `status`: resultat del ping directe (P8, 09-fases-i-proves.md) per servidor,
// clau = `Server.id`. Cap component hi escriu directament — sempre via `pingServer`/`watchPing`.
//
// - Només es fa ping amb la pestanya visible (06 §10): amagada no es fa res i, en tornar a ser visible, es
//   refresca allò que s'està mirant (`watchPing`).
// - Sense xarxa no es fa ping: es mostra l'últim resultat conegut (persistit a `localStorage`) marcat com a `stale`
//   (07 §3.1, «fora de línia amb dades de cache»).

export type ServerPingState =
  | { state: 'loading' }
  | { state: 'done'; online: boolean; players?: { online: number; max: number }; latencyMs?: number; /** Dada de la memòria cau, no d'ara. */ stale?: boolean; /** Quan es va mesurar (ms des d'epoch). */ at?: number }

export const pings = signal<Record<string, ServerPingState>>({})

/** F4: un resultat recent es reutilitza (la distribució es refresca sovint i abans cada refresc tornava a fer *ping* a tots). */
const TTL_MS = 45_000
/** Període del ping mentre algú el mira (pestanya visible i amb xarxa). */
export const POLL_MS = 60_000
const CACHE_KEY = 'hellmc.pingCache.v1'
/** Una dada de més de 7 dies no s'ensenya (seria enganyosa). */
const CACHE_MAX_AGE_MS = 7 * 24 * 3600 * 1000

const lastPingAt = new Map<string, number>()
const inFlight = new Set<string>()

type CachedPing = { online: boolean; players?: { online: number; max: number }; latencyMs?: number; at: number }

function readCache(): Record<string, CachedPing> {
  try {
    const raw = localStorage.getItem(CACHE_KEY)
    const parsed: unknown = raw != null ? JSON.parse(raw) : {}
    return parsed != null && typeof parsed === 'object' ? (parsed as Record<string, CachedPing>) : {}
  } catch {
    return {}
  }
}

function writeCache(serverId: string, value: CachedPing): void {
  try {
    const all = readCache()
    all[serverId] = value
    localStorage.setItem(CACHE_KEY, JSON.stringify(all))
  } catch {
    // sense emmagatzematge (mode privat, quota…): només es perd la memòria cau
  }
}

/** Última dada coneguda d'un servidor (persistida), o `null` si no n'hi ha o és massa vella. */
export function cachedPing(serverId: string, now = Date.now()): ServerPingState | null {
  const c = readCache()[serverId]
  if (c == null || typeof c.at !== 'number' || now - c.at > CACHE_MAX_AGE_MS) return null
  return { state: 'done', online: c.online, players: c.players, latencyMs: c.latencyMs, stale: true, at: c.at }
}

export async function pingServer(serverId: string, address: string, options: { force?: boolean } = {}): Promise<void> {
  if (inFlight.has(serverId)) return
  // Sense xarxa: no es pregunta a ningú; s'ensenya l'última dada coneguda (si n'hi ha) com a «de cache».
  // (Abans del TTL: en perdre la connexió la dada fresca també s'ha de marcar com a vella.)
  if (!online.value) {
    const cached = cachedPing(serverId)
    pings.value = { ...pings.value, [serverId]: cached ?? { state: 'done', online: false } }
    return
  }
  const last = lastPingAt.get(serverId)
  if (options.force !== true && last != null && Date.now() - last < TTL_MS) return
  // Mai ping amb la finestra amagada (sense polling innecessari, 06 §10) llevat que es demani expressament.
  if (options.force !== true && document.visibilityState === 'hidden') return

  inFlight.add(serverId)
  pings.value = { ...pings.value, [serverId]: pings.value[serverId]?.state === 'done' ? pings.value[serverId] : { state: 'loading' } }
  try {
    const result = await hellmc.status.ping(address).catch(() => ({ online: false }) as Awaited<ReturnType<typeof hellmc.status.ping>>)
    const at = Date.now()
    lastPingAt.set(serverId, at)
    pings.value = {
      ...pings.value,
      [serverId]: { state: 'done', online: result.online, players: result.players, latencyMs: result.latencyMs, at }
    }
    // Només es desa el que ha respost: un «no connecta» no ha de pisar l'última dada bona.
    if (result.online) writeCache(serverId, { online: true, players: result.players, latencyMs: result.latencyMs, at })
  } finally {
    inFlight.delete(serverId)
  }
}

// ── Seguiment periòdic ────────────────────────────────────────────────────────────────────────────────
// Els components que mostren l'estat d'un servidor el «vigilen»: mentre n'hi ha algun, es refresca cada `POLL_MS` si la
// pestanya és visible, en tornar a ser visible i en recuperar la xarxa. Sense vigilants no hi ha cap temporitzador.

const watchers = new Map<string, { address: string; count: number }>()
let timer: ReturnType<typeof setInterval> | null = null
let listening = false

function pingWatched(force = false): void {
  if (document.visibilityState !== 'visible') return
  for (const [id, w] of watchers) void pingServer(id, w.address, force ? { force: true } : {})
}

const onVisibility = () => pingWatched()
const onOnline = () => pingWatched(true)
const onOffline = () => {
  // Es passa a la dada de cache de tot el que es vigila.
  for (const [id] of watchers) {
    const cached = cachedPing(id)
    if (cached != null) pings.value = { ...pings.value, [id]: cached }
  }
}

function ensureRunning(): void {
  if (!listening) {
    document.addEventListener('visibilitychange', onVisibility)
    window.addEventListener('online', onOnline)
    window.addEventListener('offline', onOffline)
    listening = true
  }
  if (timer == null) timer = setInterval(() => pingWatched(), POLL_MS)
}

function stopIfIdle(): void {
  if (watchers.size > 0) return
  if (timer != null) clearInterval(timer)
  timer = null
  if (listening) {
    document.removeEventListener('visibilitychange', onVisibility)
    window.removeEventListener('online', onOnline)
    window.removeEventListener('offline', onOffline)
    listening = false
  }
}

/** Comença a vigilar un servidor (ping immediat si cal + periòdic). Retorna la funció per deixar-lo de vigilar. */
export function watchPing(serverId: string, address: string): () => void {
  const w = watchers.get(serverId)
  if (w != null) { w.count++; w.address = address } else watchers.set(serverId, { address, count: 1 })
  ensureRunning()
  void pingServer(serverId, address)
  return () => {
    const cur = watchers.get(serverId)
    if (cur == null) return
    if (--cur.count <= 0) watchers.delete(serverId)
    stopIfIdle()
  }
}
