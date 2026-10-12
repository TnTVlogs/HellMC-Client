import { signal } from '@preact/signals'
import { hellmc, type WardrobeItem, type WardrobeSettings, type WardrobeSlot, type WardrobeState } from '../api'
import { t } from '../i18n'
import { parseCosmetic, parseEmotes, type CosmeticSpec, type EmoteSpec } from '../utils/bbmodel'
import { previewView, type Previewer } from '../utils/preview'

// docs/client-cosmetics/17-armari-i-seleccio.md: catàleg local + selecció del compte actiu. El procés
// principal escriu `equipped.json` (el joc el llegeix); cap component escriu aquests signals directament.

export const catalog = signal<WardrobeItem[]>([])
/** Ranura → id equipat; 8 sectors de la roda → id o null. */
export const equippedCosmetics = signal<Record<WardrobeSlot, string | null>>({ head: null, face: null, back: null, body: null, feet: null })
export const equippedEmotes = signal<(string | null)[]>(Array.from({ length: 8 }, () => null))
export const wardrobeSettings = signal<WardrobeSettings>({ hideOthers: false, maxDistance: 32, autoCamera: true, wheelKey: 'B', menuKey: 'N' })
export const wardrobeLoading = signal(false)
export const wardrobeBusy = signal(false)
/** Últim missatge d'error ja traduït, o `null`. */
export const wardrobeError = signal<string | null>(null)

export const SLOTS: WardrobeSlot[] = ['head', 'face', 'back', 'body', 'feet']

/** `WARDROBE_ERROR:<CODI>` (procés principal) → text traduït; qualsevol altre error es mostra genèric. */
export function wardrobeErrorMessage(err: unknown): string {
  const message = err instanceof Error ? err.message : String(err)
  const match = /WARDROBE_ERROR:([A-Z_]+)/.exec(message)
  return t(`wardrobe.errors.${match != null ? match[1] : 'UNKNOWN'}`)
}

function apply(state: WardrobeState): void {
  catalog.value = state.catalog
  equippedCosmetics.value = state.equipped.cosmetics
  equippedEmotes.value = state.equipped.emotes
  wardrobeSettings.value = state.equipped.settings
}

async function run(action: () => Promise<WardrobeState | null>): Promise<void> {
  wardrobeBusy.value = true
  wardrobeError.value = null
  try {
    const state = await action()
    if (state != null) apply(state)
  } catch (err) {
    wardrobeError.value = wardrobeErrorMessage(err)
  } finally {
    wardrobeBusy.value = false
  }
}

export async function loadWardrobe(): Promise<void> {
  wardrobeLoading.value = true
  wardrobeError.value = null
  try {
    apply(await hellmc.wardrobe.state())
  } catch (err) {
    wardrobeError.value = wardrobeErrorMessage(err)
  } finally {
    wardrobeLoading.value = false
  }
}

export const setCosmetic = (slot: WardrobeSlot, id: string | null) => run(() => hellmc.wardrobe.setCosmetic(slot, id))
export const setEmote = (index: number, id: string | null) => run(() => hellmc.wardrobe.setEmote(index, id))
export const updateSettings = (patch: Partial<WardrobeSettings>) => run(() => hellmc.wardrobe.setSettings(patch))
export const removeItem = (id: string) => run(() => {
  cosmeticCache.delete(id)
  emoteCache.delete(id)
  return hellmc.wardrobe.remove(id)
})

// ── Previsualització 3D (models llegits pel procés principal, interpretats aquí amb `utils/bbmodel`) ──
const cosmeticCache = new Map<string, CosmeticSpec | null>()
const emoteCache = new Map<string, EmoteSpec | null>()

/** Cosmètic llest per al visor, o `null` si el fitxer no es pot llegir (es memoritza; s'esborra en esborrar l'element). */
export async function loadCosmeticSpec(id: string): Promise<CosmeticSpec | null> {
  if (cosmeticCache.has(id)) return cosmeticCache.get(id) ?? null
  let spec: CosmeticSpec | null = null
  try {
    const data = await hellmc.wardrobe.readItem(id)
    spec = parseCosmetic(data.model, data.attach, data.offset, data.scale)
  } catch {
    spec = null
  }
  cosmeticCache.set(id, spec)
  return spec
}

/** Primera animació de l'emote, o `null`. */
export async function loadEmoteSpec(id: string): Promise<EmoteSpec | null> {
  if (emoteCache.has(id)) return emoteCache.get(id) ?? null
  let spec: EmoteSpec | null = null
  try {
    const data = await hellmc.wardrobe.readItem(id)
    spec = parseEmotes(data.model)[0] ?? null
  } catch {
    spec = null
  }
  emoteCache.set(id, spec)
  return spec
}

// ── Catàleg del servidor i previsualitzacions quietes ───────────────────────────────────────────────
/** id → PNG (data URL) de la previsualització; es llegeix de la caché de l'Armari quan una targeta en necessita. */
export const previews = signal<Record<string, string>>({})
export const previewsPending = signal(0)
const previewTried = new Set<string>()
let previewJob: Promise<void> | null = null

/** Baixa el catàleg (sense xarxa deixa el que hi ha) i genera les imatges que falten. */
export async function syncWardrobe(): Promise<void> {
  try {
    apply(await hellmc.wardrobe.sync())
  } catch {
    /* sense xarxa o error del servidor: es mostra el que ja hi ha */
  }
  await ensurePreviews()
}

/** Llegeix de disc la imatge d'un element (una sola vegada; el resultat queda a `previews`). */
export async function loadPreview(id: string): Promise<void> {
  if (previews.value[id] != null) return
  try {
    const url = await hellmc.wardrobe.readPreview(id)
    if (url != null) previews.value = { ...previews.value, [id]: url }
  } catch {
    /* sense imatge: la targeta mostra només el nom */
  }
}

/**
 * Renderitza (una sola vegada per element) la imatge dels cosmètics que encara no en tenen i la desa a la caché. En segon pla i d'un
 * en un; el visor 3D només es carrega si cal. Mai llança: un cosmètic que no es pot construir es deixa sense imatge.
 */
export function ensurePreviews(): Promise<void> {
  previewJob ??= (async () => {
    let previewer: Previewer | null = null
    try {
      for (;;) {
        const todo = catalog.value.filter((i) => i.kind === 'cosmetic' && !i.hasPreview && !previewTried.has(i.id))
        previewsPending.value = todo.length
        const item = todo[0]
        if (item == null) break
        previewTried.add(item.id)
        const spec = await loadCosmeticSpec(item.id)
        if (spec == null) continue
        previewer ??= await (await import('../utils/preview')).createPreviewer()
        const png = await previewer.render(spec, previewView(item.slot))
        if (png == null) continue
        try {
          apply(await hellmc.wardrobe.savePreview(item.id, png))
          previews.value = { ...previews.value, [item.id]: png }
        } catch {
          /* no s'ha pogut desar: es provarà a la propera sessió */
        }
      }
    } catch {
      /* el visor 3D no ha arrencat: es queden sense imatge */
    } finally {
      previewer?.dispose()
      previewsPending.value = 0
      previewJob = null
    }
  })()
  return previewJob
}
