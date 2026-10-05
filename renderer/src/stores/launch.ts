import type { LaunchProgress } from '../api'
import { computed, signal } from '@preact/signals'
import { hellmc } from '../api'
import { distro } from './distro'
import { effectiveSelection } from './selection'
import { instances } from './instances'

// 06 §6, store `launch`: estat dels intents de llançament, **un per destí** (`versionId::serverId`). El procés principal
// permet diversos llançaments alhora (multi-instància) i cada esdeveniment de progrés porta el seu `target`; abans hi havia
// un únic estat global i dues baixades simultànies es trepitjaven (F1). Cap component hi escriu directament — sempre a
// través de `launch`/`cancelLaunch`.

export interface LaunchTarget {
  serverId: string | null
  versionId: string
}

const IDLE: LaunchProgress = { phase: 'idle', percent: 0 }

export const launchKey = (target: LaunchTarget): string => `${target.versionId}::${target.serverId ?? ''}`

const progressByKey = signal<Record<string, LaunchProgress>>({})
const launchingByKey = signal<Record<string, boolean>>({})
/** Ordre d'inici dels llançaments en curs (l'últim és el que mostra l'indicador de la barra lateral). */
const startOrder = signal<string[]>([])

function selectionKey(): string | null {
  const { versionId, serverId } = effectiveSelection.value
  return versionId != null ? launchKey({ versionId, serverId }) : null
}

/** Progrés del destí actualment seleccionat (targeta Jugar). */
export const launchProgress = computed<LaunchProgress>(() => {
  const key = selectionKey()
  return (key != null ? progressByKey.value[key] : undefined) ?? IDLE
})

/** El destí seleccionat s'està llançant ara mateix. */
export const isLaunching = computed<boolean>(() => {
  const key = selectionKey()
  return key != null && launchingByKey.value[key] === true
})

/** El llançament en curs més recent, de qualsevol destí (indicador global de la barra lateral); `null` si no n'hi ha cap. */
export const activeLaunch = computed<LaunchProgress | null>(() => {
  for (let i = startOrder.value.length - 1; i >= 0; i--) {
    const key = startOrder.value[i]
    if (launchingByKey.value[key] === true) return progressByKey.value[key] ?? IDLE
  }
  return null
})

function setProgress(key: string, progress: LaunchProgress): void {
  progressByKey.value = { ...progressByKey.value, [key]: progress }
}

function setLaunching(key: string, on: boolean): void {
  launchingByKey.value = { ...launchingByKey.value, [key]: on }
  if (on) startOrder.value = [...startOrder.value.filter((k) => k !== key), key]
}

hellmc.launch.onProgress((progress) => {
  if (progress.target == null) return
  const key = launchKey(progress.target)
  // En jugar, el procés principal refresca la distribució abans de res (`refreshing-distribution`) i el llançament
  // ja fa servir la nova. En passar a `validating-account` aquest refresc ha acabat: es porta la còpia (en memòria,
  // sense xarxa) a la interfície perquè llistes, versions i noms no es quedin amb els de l'arrencada.
  if (progress.phase === 'validating-account' && progressByKey.value[key]?.phase !== 'validating-account') {
    void hellmc.distro.get().then((fresh) => { distro.value = fresh }).catch(() => { /* es queda la que hi havia */ })
  }
  setProgress(key, progress)
  if (progress.phase === 'ready' || progress.phase === 'closed' || progress.phase === 'error') {
    setLaunching(key, false)
  }
})

export async function launch(target: LaunchTarget): Promise<void> {
  const key = launchKey(target)
  setLaunching(key, true)
  setProgress(key, { phase: 'starting', percent: 0, target })
  try {
    await hellmc.launch.start(target)
  } catch (err) {
    // Un handler que llança no ha de deixar la UI en «Cancel·lar» eternament.
    setLaunching(key, false)
    setProgress(key, {
      phase: 'error',
      percent: 0,
      target,
      error: { code: 'LAUNCH_FAILED', message: err instanceof Error ? err.message : String(err) }
    })
  }
}

/** Cancel·la el llançament del destí donat o, per defecte, del seleccionat. */
export async function cancelLaunch(target?: LaunchTarget): Promise<void> {
  const resolved = target ?? (() => {
    const { versionId, serverId } = effectiveSelection.value
    return versionId != null ? { versionId, serverId } : null
  })()
  if (resolved == null) return
  const key = launchKey(resolved)
  await hellmc.launch.cancel(resolved)
  setLaunching(key, false)
  setProgress(key, IDLE)
}

/** F5/B5: la versió té una instància en marxa o s'està llançant (no es pot instal·lar/verificar/desinstal·lar ara). */
export function isVersionInUse(versionId: string): boolean {
  if (instances.value.some((i) => i.versionId === versionId)) return true
  return Object.entries(launchingByKey.value).some(([key, on]) => on && key.startsWith(`${versionId}::`))
}
