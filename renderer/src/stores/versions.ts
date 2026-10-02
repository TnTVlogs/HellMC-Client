import type { TaskProgress } from '../api'
import { signal } from '@preact/signals'
import { hellmc } from '../api'

// 06 §6, store `versions`: estat d'instal·lació + progrés per versió, clau = `Version.id`. Cap
// component hi escriu directament — sempre via `refreshStatus`/`install`/`verify`/`uninstall`.

export interface VersionStatus {
  installed: boolean
  sizeBytes: number
  needsUpdate: boolean
  /** 07 §4.2 pt.4 (pestanya Fitxers): ruta d'instància, sempre present encara que no estigui
   * instal·lada (és on s'instal·larà). */
  path: string
}

export const statuses = signal<Record<string, VersionStatus>>({})
export const progress = signal<Record<string, TaskProgress>>({})
export const busy = signal<Record<string, boolean>>({})

hellmc.versions.onProgress((versionId, p) => {
  progress.value = { ...progress.value, [versionId]: p }
})

export async function refreshStatus(versionId: string): Promise<void> {
  const result = await hellmc.versions.status(versionId)
  statuses.value = { ...statuses.value, [versionId]: result }
}

async function runOp(versionId: string, op: () => Promise<void>): Promise<void> {
  busy.value = { ...busy.value, [versionId]: true }
  try {
    await op()
  } finally {
    busy.value = { ...busy.value, [versionId]: false }
    await refreshStatus(versionId)
  }
}

export function install(versionId: string): Promise<void> {
  return runOp(versionId, () => hellmc.versions.install(versionId))
}

export function verify(versionId: string): Promise<void> {
  return runOp(versionId, () => hellmc.versions.verify(versionId))
}

export function uninstall(versionId: string): Promise<void> {
  return runOp(versionId, () => hellmc.versions.uninstall(versionId))
}
