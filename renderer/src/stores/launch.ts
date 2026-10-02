import type { LaunchProgress } from '../api'
import { signal } from '@preact/signals'
import { hellmc } from '../api'

// 06 §6, store `launch`: estat de l'últim/actual intent de llançament. Cap component hi escriu
// directament — sempre a través de `launch`/`cancelLaunch`.

const IDLE: LaunchProgress = { phase: 'idle', percent: 0 }

export const launchProgress = signal<LaunchProgress>(IDLE)
export const isLaunching = signal(false)

// 2.11: `launch.cancel` ara necessita saber QUIN llançament cancel·lar (pot haver-n'hi més d'un
// alhora, multi-instància real) — es recorda el darrer objectiu llançat des d'aquest store perquè
// `cancelLaunch()` no hagi de rebre'l a cada crida (la targeta Jugar només en té un a la vista).
let lastTarget: { serverId: string | null; versionId: string } | null = null

hellmc.launch.onProgress((progress) => {
  launchProgress.value = progress
  if (progress.phase === 'ready' || progress.phase === 'closed' || progress.phase === 'error') {
    isLaunching.value = false
  }
})

export async function launch(target: { serverId: string | null; versionId: string }): Promise<void> {
  lastTarget = target
  isLaunching.value = true
  launchProgress.value = { phase: 'starting', percent: 0 }
  await hellmc.launch.start(target)
}

export async function cancelLaunch(): Promise<void> {
  if (lastTarget != null) await hellmc.launch.cancel(lastTarget)
  isLaunching.value = false
  launchProgress.value = IDLE
}
