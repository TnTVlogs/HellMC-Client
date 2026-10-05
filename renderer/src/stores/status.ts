import { signal } from '@preact/signals'
import { hellmc } from '../api'

// 06 §6, store `status`: resultat del ping directe (P8, 09-fases-i-proves.md) per servidor,
// clau = `Server.id`. Cap component hi escriu directament — sempre via `pingServer`.

export type ServerPingState =
  | { state: 'loading' }
  | { state: 'done'; online: boolean; players?: { online: number; max: number }; latencyMs?: number }

export const pings = signal<Record<string, ServerPingState>>({})

/** F4: un resultat recent es reutilitza (la distribució es refresca sovint i abans cada refresc tornava a fer *ping* a tots). */
const TTL_MS = 45_000
const lastPingAt = new Map<string, number>()
const inFlight = new Set<string>()

export async function pingServer(serverId: string, address: string, options: { force?: boolean } = {}): Promise<void> {
  if (inFlight.has(serverId)) return
  const last = lastPingAt.get(serverId)
  if (options.force !== true && last != null && Date.now() - last < TTL_MS) return
  // Mai ping amb la finestra amagada (sense polling innecessari, 06 §10) llevat que es demani expressament.
  if (options.force !== true && document.visibilityState === 'hidden') return

  inFlight.add(serverId)
  pings.value = { ...pings.value, [serverId]: pings.value[serverId]?.state === 'done' ? pings.value[serverId] : { state: 'loading' } }
  try {
    const result = await hellmc.status.ping(address).catch(() => ({ online: false }) as Awaited<ReturnType<typeof hellmc.status.ping>>)
    lastPingAt.set(serverId, Date.now())
    pings.value = {
      ...pings.value,
      [serverId]: { state: 'done', online: result.online, players: result.players, latencyMs: result.latencyMs }
    }
  } finally {
    inFlight.delete(serverId)
  }
}
