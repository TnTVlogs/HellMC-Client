import { signal } from '@preact/signals'
import { hellmc, type LibrarySkin, type MojangProfile } from '../api'
import { t } from '../i18n'
import { selectedUuid } from './account'
import { loadAvatar } from './avatars'

// docs/client-cosmetics/14-skins.md: biblioteca local de skins + perfil real de Mojang (només
// comptes Microsoft). Cap component escriu aquests signals directament, només les accions d'aquí.

export const library = signal<LibrarySkin[]>([])
/** uuid de compte → id de skin «posada» en local (comptes offline). */
export const localSelection = signal<Record<string, string>>({})
export const profile = signal<MojangProfile | null>(null)
export const appearanceLoading = signal(false)
export const appearanceBusy = signal(false)
/** Últim missatge d'error ja traduït, o `null`. */
export const appearanceError = signal<string | null>(null)
export const appearanceNotice = signal<string | null>(null)

/** `SKINS_ERROR:<CODI>` (procés principal) → text traduït; qualsevol altre error es mostra genèric. */
export function skinsErrorMessage(err: unknown): string {
  const message = err instanceof Error ? err.message : String(err)
  const match = /SKINS_ERROR:([A-Z_]+)/.exec(message)
  return t(`skins.errors.${match != null ? match[1] : 'UNKNOWN'}`)
}

async function run<T>(action: () => Promise<T>): Promise<T | undefined> {
  appearanceBusy.value = true
  appearanceError.value = null
  appearanceNotice.value = null
  try {
    return await action()
  } catch (err) {
    appearanceError.value = skinsErrorMessage(err)
    return undefined
  } finally {
    appearanceBusy.value = false
  }
}

async function reloadLibrary(): Promise<void> {
  const result = await hellmc.skins.library()
  library.value = result.skins
  localSelection.value = result.selection
}

/** El cap del compte actiu es torna a demanar: la skin pot haver canviat (o s'acaba de desar a la caché). */
function refreshAvatar(): void {
  if (selectedUuid.value != null) void loadAvatar(selectedUuid.value, true)
}

/** Compte del qual `library` i `profile` ja tenen dades: en tornar-hi es mostren a l'instant i es refresquen en segon pla. */
let loadedFor: string | null = null

/**
 * Carrega biblioteca i perfil. Si el perfil de Mojang falla, la biblioteca local es mostra igualment. Si ja hi ha dades
 * d'aquest compte no es mostra l'indicador de càrrega (es veuen les que hi ha mentre es refresquen).
 */
export async function loadAppearance(accountUuid: string | null): Promise<void> {
  const warm = accountUuid != null && loadedFor === accountUuid
  if (!warm) {
    library.value = []
    profile.value = null
    appearanceLoading.value = true
  }
  appearanceError.value = null
  try {
    await reloadLibrary()
    loadedFor = accountUuid
    try {
      profile.value = await hellmc.skins.profile()
    } catch (err) {
      if (!warm) profile.value = null
      appearanceError.value = skinsErrorMessage(err)
    }
  } catch (err) {
    appearanceError.value = skinsErrorMessage(err)
  } finally {
    appearanceLoading.value = false
    refreshAvatar()
  }
}

export async function addSkinFromFile(): Promise<LibrarySkin | null> {
  const entry = await run(async () => {
    const added = await hellmc.skins.addFile()
    if (added != null) await reloadLibrary()
    return added
  })
  return entry ?? null
}

export async function importSkinByName(name: string): Promise<LibrarySkin | null> {
  const entry = await run(async () => {
    const added = await hellmc.skins.importByName(name)
    await reloadLibrary()
    return added
  })
  return entry ?? null
}

export async function importCurrentSkin(): Promise<LibrarySkin | null> {
  const entry = await run(async () => {
    const added = await hellmc.skins.importCurrent()
    await reloadLibrary()
    return added
  })
  return entry ?? null
}

export async function removeSkin(id: string): Promise<void> {
  await run(async () => {
    await hellmc.skins.remove(id)
    await reloadLibrary()
  })
}

export async function renameSkin(id: string, name: string): Promise<void> {
  await run(async () => {
    await hellmc.skins.rename(id, name)
    await reloadLibrary()
  })
}

export async function setSkinVariant(id: string, variant: 'classic' | 'slim'): Promise<void> {
  await run(async () => {
    await hellmc.skins.setVariant(id, variant)
    await reloadLibrary()
  })
}

/** Microsoft → puja a Mojang i recarrega el perfil; offline → selecció local. */
export async function applySkin(id: string): Promise<void> {
  await run(async () => {
    const { scope } = await hellmc.skins.apply(id)
    await reloadLibrary()
    if (scope === 'mojang') profile.value = await hellmc.skins.profile()
    appearanceNotice.value = t(scope === 'mojang' ? 'skins.appliedMojang' : 'skins.appliedLocal')
    refreshAvatar()
  })
}

export async function clearLocalSkin(): Promise<void> {
  await run(async () => {
    await hellmc.skins.clearLocal()
    await reloadLibrary()
    refreshAvatar()
  })
}

export async function setCape(capeId: string | null): Promise<void> {
  await run(async () => {
    profile.value = await hellmc.skins.setCape(capeId)
  })
}
