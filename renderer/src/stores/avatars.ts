import { signal } from '@preact/signals'
import { hellmc } from '../api'

// Cap de cada compte (la skin que porta, o la darrera que es va veure). El procés principal ja resol
// Mojang → caché → API pública; aquí només es recorda el resultat per no repetir la crida.
// `null` = consultat i sense skin (es dibuixa Steve); absent = encara no consultat.

export const avatarSkins = signal<Record<string, string | null>>({})
const pending = new Set<string>()

export async function loadAvatar(uuid: string, force = false): Promise<void> {
  if ((!force && uuid in avatarSkins.value) || pending.has(uuid)) return
  pending.add(uuid)
  try {
    const image = await hellmc.skins.avatar(uuid)
    avatarSkins.value = { ...avatarSkins.value, [uuid]: image }
  } catch {
    avatarSkins.value = { ...avatarSkins.value, [uuid]: null }
  } finally {
    pending.delete(uuid)
  }
}
