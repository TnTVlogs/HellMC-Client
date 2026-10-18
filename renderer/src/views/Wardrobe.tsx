import { useEffect, useState } from 'preact/hooks'
import { Check, PersonStanding, Shirt, Trash2 } from 'lucide-preact'
import { Tooltip } from '../components/Tooltip'
import { Select } from '../components/Select'
import { t } from '../i18n'
import { hellmc, type WardrobeItem, type WardrobeSlot } from '../api'
import type { CosmeticSpec, EmoteSpec } from '../utils/bbmodel'
import { SkinViewer } from '../components/SkinViewer'
import { Button } from '../components/Button'
import { Banner, Chip } from '../components/ui'
import { Toggle } from '../components/Toggle'
import { Tabs } from '../components/Tabs'
import { ConfirmDialog } from '../components/ConfirmDialog'
import { selectedAccount } from '../stores/account'
import {
  SLOTS, catalog, equippedCosmetics, equippedEmotes, loadCosmeticSpec, loadEmoteSpec, loadPreview, loadWardrobe, peekCosmeticSpec, previews, previewsPending, removeItem, setCosmetic, setEmote, syncWardrobe,
  updateSettings, wardrobeSettings, wardrobeSkins, wardrobeBusy, wardrobeError, wardrobeLoading
} from '../stores/wardrobe'

// docs/client-cosmetics/17-armari-i-seleccio.md i 20-cataleg-al-panell.md: el contingut el publiquen els administradors al panell
// (aquí no s'importa res). Cada cosmètic té una targeta amb una imatge quieta generada una sola vegada i desada a la caché.
// Cosmètics: un per ranura. Emotes: es tria un dels 8 sectors de la roda i després l'emote que hi va.

const LETTERS = Array.from({ length: 26 }, (_, i) => String.fromCharCode(65 + i))

export function Wardrobe() {
  const accountUuid = selectedAccount.value?.uuid ?? null
  const busy = wardrobeBusy.value
  const items = catalog.value
  const [query, setQuery] = useState('')
  const q = query.trim().toLowerCase()
  const matches = (i: WardrobeItem) => q === '' || i.name.toLowerCase().includes(q)
  const cosmetics = items.filter((i) => i.kind === 'cosmetic' && matches(i))
  const emotes = items.filter((i) => i.kind === 'emote' && matches(i))
  const byId = new Map(items.map((i) => [i.id, i]))

  const [tab, setTab] = useState<'cosmetics' | 'emotes' | 'settings'>('cosmetics')
  const [sector, setSector] = useState(0)
  const [deleting, setDeleting] = useState<WardrobeItem | null>(null)
  /** Element «mirat»: un cosmètic es mostra posat (encara que no ho estigui) i un emote es reprodueix. */
  const [viewing, setViewing] = useState<string | null>(null)
  const [skin, setSkin] = useState<{ image: string | null; variant: 'classic' | 'slim' }>(
    () => (accountUuid != null ? wardrobeSkins.get(accountUuid) : undefined) ?? { image: null, variant: 'classic' })
  // Els cosmètics equipats ja llegits es pinten al primer fotograma (sense passar pel jugador nu).
  const [specs, setSpecs] = useState<CosmeticSpec[]>(() =>
    SLOTS.map((slot) => equippedCosmetics.value[slot]).map((id) => (id != null ? peekCosmeticSpec(id) : null)).filter((x): x is CosmeticSpec => x != null))
  const [emote, setEmoteSpec] = useState<EmoteSpec | null>(null)

  useEffect(() => { void loadWardrobe(accountUuid).then(() => syncWardrobe()) }, [accountUuid])
  // Imatges de les targetes: es llegeixen de la caché quan l'element és a la llista (les que falten les genera `syncWardrobe`).
  const previewKey = items.filter((i) => i.hasPreview).map((i) => i.id).join('|')
  useEffect(() => { for (const id of previewKey === '' ? [] : previewKey.split('|')) void loadPreview(id) }, [previewKey])

  // Skin del visor: la que el compte porta (local o, si és Microsoft, la de Mojang); sense xarxa si no cal.
  useEffect(() => {
    let stale = false
    const show = (next: { image: string | null; variant: 'classic' | 'slim' }) => {
      if (stale) return
      if (accountUuid != null) wardrobeSkins.set(accountUuid, next)
      setSkin(next)
    }
    void (async () => {
      try {
        const lib = await hellmc.skins.library()
        const picked = accountUuid != null ? lib.skins.find((s) => s.id === lib.selection[accountUuid]) : undefined
        if (picked != null) { show({ image: picked.image, variant: picked.variant }); return }
        const profile = selectedAccount.value?.type === 'microsoft' ? await hellmc.skins.profile() : null
        const active = profile?.skins.find((s) => s.active)
        show(active != null ? { image: active.image, variant: active.variant } : { image: null, variant: 'classic' })
      } catch {
        if (accountUuid == null || !wardrobeSkins.has(accountUuid)) show({ image: null, variant: 'classic' })
      }
    })()
    return () => { stale = true }
  }, [accountUuid])

  // Cosmètics a dibuixar = els equipats + el que s'està mirant (substitueix el de la mateixa ranura).
  const equipped = equippedCosmetics.value
  const viewed = viewing != null ? byId.get(viewing) : undefined
  const shownIds = SLOTS.map((slot) => (viewed?.kind === 'cosmetic' && viewed.slot === slot ? viewed.id : equipped[slot])).filter((id): id is string => id != null)
  const shownKey = shownIds.join('|')
  const viewedEmote = viewed?.kind === 'emote' ? viewed.id : null
  useEffect(() => {
    let stale = false
    void Promise.all(shownKey === '' ? [] : shownKey.split('|').map(loadCosmeticSpec)).then((list) => {
      if (!stale) setSpecs(list.filter((x): x is CosmeticSpec => x != null))
    })
    return () => { stale = true }
  }, [shownKey])
  useEffect(() => {
    let stale = false
    if (viewedEmote == null) { setEmoteSpec(null); return }
    void loadEmoteSpec(viewedEmote).then((e) => { if (!stale) setEmoteSpec(e) })
    return () => { stale = true }
  }, [viewedEmote])

  function cosmeticCard(item: WardrobeItem) {
    const worn = item.slot != null && equippedCosmetics.value[item.slot] === item.id
    return (
      <div key={item.id} class="skin-card wd-card">
        <button type="button" class="wd-thumb" aria-label={item.name} aria-pressed={viewing === item.id} onClick={() => setViewing(viewing === item.id ? null : item.id)}>
          {previews.value[item.id] != null
            ? <img src={previews.value[item.id]} alt="" width={112} height={112} draggable={false} />
            : <Tooltip content={t('wardrobe.noPreview')}><span class="wd-thumb-empty"><Shirt size={32} /></span></Tooltip>}
        </button>
        <b class="small ellipsis wd-title">{item.name}</b>
        <span class="xs muted">{item.slot != null ? t(`wardrobe.slot.${item.slot}`) : ''}</span>
        {worn && <Chip tone="ok" icon={Check}>{t('wardrobe.equipped')}</Chip>}
        <div class="wd-actions">
          <Button size="sm" variant={worn ? 'secondary' : 'primary'} disabled={busy || item.slot == null}
            onClick={() => void setCosmetic(item.slot as WardrobeSlot, worn ? null : item.id)}>
            {worn ? t('wardrobe.unequip') : t('wardrobe.equip')}
          </Button>
          <Button size="sm" variant="ghost" disabled={busy} aria-label={t('wardrobe.delete')} onClick={() => setDeleting(item)}><Trash2 size={16} /></Button>
        </div>
      </div>
    )
  }

  function emoteCard(item: WardrobeItem) {
    const at = equippedEmotes.value.indexOf(item.id)
    return (
      <div key={item.id} class="skin-card wd-card">
        <button type="button" class="wd-thumb" aria-label={item.name} aria-pressed={viewing === item.id} onClick={() => setViewing(viewing === item.id ? null : item.id)}>
          <span class="wd-thumb-empty"><PersonStanding size={32} /></span>
        </button>
        <b class="small ellipsis wd-title">{item.name}</b>
        {at >= 0 && <Chip tone="ok" icon={Check}>{t('wardrobe.sector', { n: at + 1 })}</Chip>}
        <div class="wd-actions">
          <Button size="sm" variant={at === sector ? 'secondary' : 'primary'} disabled={busy || at === sector}
            onClick={() => void setEmote(sector, item.id)}>{t('wardrobe.placeHere', { n: sector + 1 })}</Button>
          <Button size="sm" variant="ghost" disabled={busy} aria-label={t('wardrobe.delete')} onClick={() => setDeleting(item)}><Trash2 size={16} /></Button>
        </div>
      </div>
    )
  }

  return (
    <>
      <div class="page-head">
        <div class="grow"><h1>{t('nav.wardrobe')}</h1><p>{t('wardrobe.subtitle')}</p></div>
      </div>

      {wardrobeError.value != null && <Banner tone="warn">{wardrobeError.value}</Banner>}
      <p class="muted small">{t('wardrobe.gameHint')}{previewsPending.value > 0 ? ` · ${t('wardrobe.generatingPreviews')}` : ''}</p>

      <div class="appearance">
        <section class="card pad appearance-viewer" aria-label={t('skins.previewing')}>
          <SkinViewer skin={skin.image} variant={skin.variant} cape={null} walking={false} cosmetics={specs} emote={emote} loading={wardrobeLoading.value} />
          <span class="muted xs">{t('wardrobe.viewerHint')}</span>
        </section>

      <section class="appearance-main">
        <Tabs
          items={[{ id: 'cosmetics', label: t('wardrobe.tabCosmetics') }, { id: 'emotes', label: t('wardrobe.tabEmotes') }, { id: 'settings', label: t('wardrobe.tabSettings') }]}
          active={tab}
          onChange={(id) => setTab(id as 'cosmetics' | 'emotes' | 'settings')}
        />

        {tab === 'cosmetics' && (
          <div class="appearance-pane">
            <div class="ap-add">
              <input class="field" type="search" value={query} placeholder={t('wardrobe.search')} aria-label={t('wardrobe.search')} onInput={(e) => setQuery((e.target as HTMLInputElement).value)} />
            </div>
            <ul class="wd-slots">
              {SLOTS.map((slot) => {
                const worn = equippedCosmetics.value[slot]
                return (
                  <li key={slot} class="wd-slot">
                    <span class="small muted">{t(`wardrobe.slot.${slot}`)}</span>
                    <b class="small">{worn != null ? byId.get(worn)?.name ?? t('wardrobe.none') : t('wardrobe.none')}</b>
                  </li>
                )
              })}
            </ul>
            {wardrobeLoading.value && <p class="muted">{t('skins.loading')}</p>}
            <div class="skin-grid" role="list">{cosmetics.map(cosmeticCard)}</div>
            {!wardrobeLoading.value && cosmetics.length === 0 && <p class="muted">{q !== '' ? t('wardrobe.noResults') : t('wardrobe.emptyCosmetics')}</p>}
          </div>
        )}

        {tab === 'emotes' && (
          <div class="appearance-pane">
            <h2 class="small">{t('wardrobe.wheel')}</h2>
            <p class="muted small">{t('wardrobe.wheelHint')}</p>
            <div class="wd-wheel" role="list">
              {equippedEmotes.value.map((id, index) => (
                <button key={index} type="button" role="listitem" class="skin-card" aria-pressed={sector === index} onClick={() => setSector(index)}>
                  <span class="xs muted">{t('wardrobe.sector', { n: index + 1 })}</span>
                  <b class="small ellipsis">{id != null ? byId.get(id)?.name ?? t('wardrobe.emptySector') : t('wardrobe.emptySector')}</b>
                </button>
              ))}
            </div>
            <div class="ap-buttons">
              <Button size="sm" disabled={busy || equippedEmotes.value[sector] == null} onClick={() => void setEmote(sector, null)}>{t('wardrobe.clearSector')}</Button>
              <input class="field" type="search" value={query} placeholder={t('wardrobe.search')} aria-label={t('wardrobe.search')} onInput={(e) => setQuery((e.target as HTMLInputElement).value)} />
            </div>
            {wardrobeLoading.value && <p class="muted">{t('skins.loading')}</p>}
            <div class="skin-grid" role="list">{emotes.map(emoteCard)}</div>
            {!wardrobeLoading.value && emotes.length === 0 && <p class="muted">{q !== '' ? t('wardrobe.noResults') : t('wardrobe.emptyEmotes')}</p>}
          </div>
        )}

        {tab === 'settings' && (
          <div class="appearance-pane">
            <div class="field-row">
              <label>{t('wardrobe.hideOthers')}</label>
              <Toggle checked={wardrobeSettings.value.hideOthers} disabled={busy} label={t('wardrobe.hideOthers')} onChange={(v) => void updateSettings({ hideOthers: v })} />
            </div>
            <div class="field-row">
              <label for="wd-distance">{t('wardrobe.maxDistance')}</label>
              <input id="wd-distance" class="field wd-number" type="number" min={8} max={128} step={8} value={wardrobeSettings.value.maxDistance} disabled={busy}
                onChange={(e) => { const v = Number((e.target as HTMLInputElement).value); if (Number.isFinite(v)) void updateSettings({ maxDistance: v }) }} />
            </div>
            <div class="field-row">
              <label>{t('wardrobe.autoCamera')}</label>
              <Toggle checked={wardrobeSettings.value.autoCamera} disabled={busy} label={t('wardrobe.autoCamera')} onChange={(v) => void updateSettings({ autoCamera: v })} />
            </div>
            <div class="field-row">
              <label for="wd-wheel-key">{t('wardrobe.wheelKey')}</label>
              <Select id="wd-wheel-key" class="wd-number" value={wardrobeSettings.value.wheelKey} disabled={busy}
                onChange={(v) => void updateSettings({ wheelKey: v })} options={LETTERS.map((l) => ({ value: l, label: l }))} />
            </div>
            <div class="field-row">
              <label for="wd-menu-key">{t('wardrobe.menuKey')}</label>
              <Select id="wd-menu-key" class="wd-number" value={wardrobeSettings.value.menuKey} disabled={busy}
                onChange={(v) => void updateSettings({ menuKey: v })} options={LETTERS.map((l) => ({ value: l, label: l }))} />
            </div>
          </div>
        )}
      </section>
      </div>

      {deleting != null && (
        <ConfirmDialog
          title={t('wardrobe.deleteTitle')}
          message={t('wardrobe.deleteMessage', { name: deleting.name })}
          confirmLabel={t('wardrobe.deleteConfirm')}
          cancelLabel={t('wardrobe.cancel')}
          onCancel={() => setDeleting(null)}
          onConfirm={() => { const id = deleting.id; setDeleting(null); void removeItem(id) }}
        />
      )}
    </>
  )
}
