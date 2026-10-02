import type { RunningInstance } from '../api'
import { signal } from '@preact/signals'
import { hellmc } from '../api'

// 06 §6, store `instances` (nou, 2.11 — petició de l'usuari): instàncies de joc obertes ara
// mateix (multi-instància real). Cap component hi escriu directament — sempre via `killInstance`;
// la llista es manté sola via `hellmc.instances.onChange` (l'origen de veritat és `index.js`).

export const instances = signal<RunningInstance[]>([])

hellmc.instances.onChange((list) => {
  instances.value = list
})

export async function loadInstances(): Promise<void> {
  instances.value = await hellmc.instances.list()
}

export async function killInstance(id: string): Promise<void> {
  await hellmc.instances.kill(id)
}
