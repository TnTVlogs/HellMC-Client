import { signal } from '@preact/signals'
import { hellmc } from '../api'
import { refreshDistro } from './distro'
import { loadArchive } from './news'

// 07 §7.2 / 09 O1/O5: estat de xarxa. En recuperar la connexió es refresquen distribució i
// notícies i es revalida el compte en segon pla — mai s'esborra res, només s'avisa si és `invalid`.

export const online = signal(navigator.onLine)
/** El servidor ha rebutjat el compte desat (`invalid`, 09 O6): cal tornar a iniciar sessió. */
export const sessionInvalid = signal(false)

/** 07 §1.1: estat dels serveis de Minecraft (punt de la barra lateral). `null` = encara no mesurat. */
export const minecraftServices = signal<{ id: string; ok: boolean }[] | null>(null)

export async function refreshMinecraftStatus(): Promise<void> {
  try {
    minecraftServices.value = (await hellmc.status.minecraft()).services
  } catch {
    minecraftServices.value = null
  }
}

export async function revalidateSession(): Promise<void> {
  try {
    const { status } = await hellmc.auth.validate()
    sessionInvalid.value = status === 'invalid'
  } catch {
    // error inesperat: no es considera sessió invàlida (mai destructiu per un error desconegut)
  }
}

export function initNetwork(): void {
  window.addEventListener('offline', () => { online.value = false })
  window.addEventListener('online', () => {
    online.value = true
    void refreshDistro()
    void loadArchive()
    void revalidateSession()
    void refreshMinecraftStatus()
  })
  if (navigator.onLine) void revalidateSession()
  // 07 §1.1: es mesura en mostrar l'app i cada 5 min **només si la finestra és visible** (06 §10: cap
  // polling innecessari).
  void refreshMinecraftStatus()
  setInterval(() => {
    if (document.visibilityState === 'visible' && navigator.onLine) void refreshMinecraftStatus()
  }, 5 * 60 * 1000)
}
