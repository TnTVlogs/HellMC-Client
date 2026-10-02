import { computed, signal } from '@preact/signals'
import { hellmc } from '../api'
import { distro } from './distro'

// 06 §6, store `selection`: servidor/versió recordats (`lastPlay`, 01 §5). Cap component hi
// escriu directament — sempre a través de `selectServer`/`selectVersion`.

export const selectedServerId = signal<string | null>(null)
export const selectedVersionId = signal<string | null>(null)

let loaded = false

/** Es crida un cop en arrencar, després que `distro` ja tingui dades (`main.tsx`). */
export async function loadSelection(): Promise<void> {
  const stored = await hellmc.selection.get()
  selectedServerId.value = stored.serverId
  selectedVersionId.value = stored.versionId
  loaded = true
}

/** D18: si no hi ha res desat encara (primer arrencada), preselecciona el servidor `mainServer`
 * amb la seva versió `recommended` — si no n'hi ha cap, la primera versió de la distribució
 * (D4: jugar sense servidor sempre és vàlid). Purament derivat, no es persisteix fins que
 * l'usuari canviï la selecció de veritat (`selectServer`/`selectVersion`). */
export const effectiveSelection = computed<{ serverId: string | null; versionId: string | null }>(() => {
  if (selectedServerId.value != null || selectedVersionId.value != null) {
    return { serverId: selectedServerId.value, versionId: selectedVersionId.value }
  }
  const d = distro.value
  if (d == null) return { serverId: null, versionId: null }

  const mainServer = d.servers.find((s) => s.mainServer === true)
  if (mainServer != null && mainServer.versions.length > 0) {
    const recommended = mainServer.versions.find((v) => v.recommended === true) ?? mainServer.versions[0]
    return { serverId: mainServer.id, versionId: recommended.id }
  }
  return { serverId: null, versionId: d.versions[0]?.id ?? null }
})

export async function selectVersion(versionId: string): Promise<void> {
  selectedVersionId.value = versionId
  if (loaded) await hellmc.selection.setVersion(versionId)
}

export async function selectServer(serverId: string | null): Promise<void> {
  selectedServerId.value = serverId
  if (loaded) await hellmc.selection.setServer(serverId)
}
