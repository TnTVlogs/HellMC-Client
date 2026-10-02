import { signal } from '@preact/signals'
import { hellmc } from '../api'

// 06 §6, store `status`: resultat del ping directe (P8, 09-fases-i-proves.md) per servidor,
// clau = `Server.id`. Cap component hi escriu directament — sempre via `pingServer`.

export type ServerPingState =
  | { state: 'loading' }
  | { state: 'done'; online: boolean; players?: { online: number; max: number }; latencyMs?: number }

export const pings = signal<Record<string, ServerPingState>>({})

export async function pingServer(serverId: string, address: string): Promise<void> {
  pings.value = { ...pings.value, [serverId]: { state: 'loading' } }
  const result = await hellmc.status.ping(address)
  pings.value = {
    ...pings.value,
    [serverId]: { state: 'done', online: result.online, players: result.players, latencyMs: result.latencyMs }
  }
}
