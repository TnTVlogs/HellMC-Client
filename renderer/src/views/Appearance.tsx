import { useEffect, useState } from 'preact/hooks'
import { Check, FileUp, Info, Pencil, Plus, Trash2, UserRound } from 'lucide-preact'
import { t } from '../i18n'
import type { LibrarySkin, SkinVariant } from '../api'
import { Button } from '../components/Button'
import { Banner, Chip } from '../components/ui'
import { Tabs } from '../components/Tabs'
import { ConfirmDialog } from '../components/ConfirmDialog'
import { SkinViewer } from '../components/SkinViewer'
import { CapeFront, SkinFace } from '../components/TextureThumb'
import { selectedAccount } from '../stores/account'
import {
  addSkinFromFile, appearanceBusy, appearanceError, appearanceLoading, appearanceNotice, applySkin, clearLocalSkin,
  importCurrentSkin, importSkinByName, library, loadAppearance, localSelection, profile, removeSkin, renameSkin,
  setCape, setSkinVariant
} from '../stores/appearance'

// docs/client-cosmetics/14-skins.md. Microsoft: canvi real a Mojang (skin i capa). Offline: biblioteca
// i selecció només en local (cap altre jugador la veu). El visor 3D gira amb el ratolí.

const CURRENT = 'current'
const NAME_RE = /^[A-Za-z0-9_]{1,16}$/

export function Appearance() {
  const account = selectedAccount.value
  const accountUuid = account?.uuid ?? null
  const isMicrosoft = account?.type === 'microsoft'
  const lib = library.value
  const prof = profile.value
  const busy = appearanceBusy.value

  const [tab, setTab] = useState<'skins' | 'capes'>('skins')
  const [sel, setSel] = useState<string | null>(null)
  const [capeSel, setCapeSel] = useState<string | null | undefined>(undefined)
  const [walking, setWalking] = useState(false)
  const [importName, setImportName] = useState('')
  const [renaming, setRenaming] = useState<string | null>(null)
  const [renameValue, setRenameValue] = useState('')
  const [deleting, setDeleting] = useState<LibrarySkin | null>(null)

  useEffect(() => {
    setSel(null)
    setCapeSel(undefined)
    setTab('skins')
    void loadAppearance()
  }, [accountUuid])

  // Selecció inicial (o si l'element seleccionat ha desaparegut).
  const currentSkin = prof?.skins.find((s) => s.active) ?? null
  useEffect(() => {
    if (appearanceLoading.value) return
    const exists = sel === CURRENT ? currentSkin != null : lib.some((s) => s.id === sel)
    if (sel != null && exists) return
    const local = accountUuid != null ? localSelection.value[accountUuid] : undefined
    if (isMicrosoft && currentSkin != null) setSel(CURRENT)
    else setSel(local != null && lib.some((s) => s.id === local) ? local : lib[0]?.id ?? null)
  }, [appearanceLoading.value, lib, currentSkin, isMicrosoft, accountUuid, sel])

  const selectedLib = sel != null && sel !== CURRENT ? lib.find((s) => s.id === sel) ?? null : null
  const viewerSkin = sel === CURRENT ? currentSkin?.image ?? null : selectedLib?.image ?? null
  const viewerVariant: SkinVariant = sel === CURRENT ? currentSkin?.variant ?? 'classic' : selectedLib?.variant ?? 'classic'
  const activeCape = prof?.capes.find((c) => c.active) ?? null
  const previewCape = capeSel === undefined ? activeCape : capeSel === null ? null : prof?.capes.find((c) => c.id === capeSel) ?? null
  const localInUse = accountUuid != null ? localSelection.value[accountUuid] : undefined

  async function importByName() {
    const name = importName.trim()
    if (!NAME_RE.test(name)) return
    const added = await importSkinByName(name)
    if (added != null) { setImportName(''); setSel(added.id) }
  }

  async function addFile() {
    const added = await addSkinFromFile()
    if (added != null) setSel(added.id)
  }

  async function saveCurrent() {
    const added = await importCurrentSkin()
    if (added != null) setSel(added.id)
  }

  async function commitRename(id: string) {
    const name = renameValue.trim()
    setRenaming(null)
    if (name !== '') await renameSkin(id, name)
  }

  return (
    <>
      <div class="page-head">
        <div class="grow"><h1>{t('nav.appearance')}</h1><p>{t('skins.subtitle')}</p></div>
      </div>

      {account != null && !isMicrosoft && <Banner tone="info" icon={Info}>{t('skins.offlineNotice')}</Banner>}
      {isMicrosoft && <p class="muted small">{t('skins.mojangNotice')}</p>}
      {appearanceError.value != null && <Banner tone="warn">{appearanceError.value}</Banner>}
      {appearanceNotice.value != null && <p class="small" role="status" style={{ color: 'var(--success)' }}>{appearanceNotice.value}</p>}

      <div class="appearance">
        <section class="card pad appearance-viewer" aria-label={t('skins.previewing')}>
          <SkinViewer skin={viewerSkin} variant={viewerVariant} cape={isMicrosoft ? previewCape?.image ?? null : null} walking={walking} loading={appearanceLoading.value} />
          <div class="appearance-viewer-bar">
            <div class="seg" role="group">
              <button type="button" aria-pressed={!walking} onClick={() => setWalking(false)}>{t('skins.viewerIdle')}</button>
              <button type="button" aria-pressed={walking} onClick={() => setWalking(true)}>{t('skins.viewerWalk')}</button>
            </div>
            <span class="muted xs">{t('skins.viewerHint')}</span>
          </div>
        </section>

        <section class="appearance-main">
          <Tabs
            items={[{ id: 'skins', label: t('skins.tabSkins') }, { id: 'capes', label: t('skins.tabCapes') }]}
            active={tab}
            onChange={(id) => setTab(id as 'skins' | 'capes')}
          />

          {tab === 'skins' && (
            <div class="appearance-pane">
              <div class="ap-add">
                <Button size="sm" disabled={busy} onClick={() => void addFile()}><FileUp size={16} /> {t('skins.addFile')}</Button>
                <form class="ap-import" onSubmit={(e) => { e.preventDefault(); void importByName() }}>
                  <input class="field" value={importName} maxLength={16} placeholder={t('skins.namePlaceholder')} aria-label={t('skins.importByName')}
                    onInput={(e) => setImportName((e.target as HTMLInputElement).value)} />
                  <Button size="sm" type="submit" disabled={busy || !NAME_RE.test(importName.trim())}><Plus size={16} /> {t('skins.import')}</Button>
                </form>
              </div>

              {appearanceLoading.value && <p class="muted">{t('skins.loading')}</p>}

              <div class="skin-grid" role="list">
                {isMicrosoft && currentSkin != null && (
                  <button type="button" role="listitem" class="skin-card" aria-pressed={sel === CURRENT} onClick={() => setSel(CURRENT)}>
                    {currentSkin.image != null ? <SkinFace image={currentSkin.image} /> : <UserRound size={32} />}
                    <b class="small">{t('skins.currentTitle')}</b>
                    <Chip tone="ok" icon={Check}>{t('skins.inUseMojang')}</Chip>
                  </button>
                )}
                {lib.map((s) => (
                  <button key={s.id} type="button" role="listitem" class="skin-card" aria-pressed={sel === s.id} onClick={() => setSel(s.id)}>
                    <SkinFace image={s.image} />
                    <b class="small ellipsis">{s.name}</b>
                    <span class="xs muted">{s.variant === 'slim' ? t('skins.variantSlim') : t('skins.variantClassic')}</span>
                    {!isMicrosoft && localInUse === s.id && <Chip tone="ok" icon={Check}>{t('skins.inUseLocal')}</Chip>}
                  </button>
                ))}
              </div>
              {!appearanceLoading.value && lib.length === 0 && !(isMicrosoft && currentSkin != null) && <p class="muted">{t('skins.empty')}</p>}

              {sel === CURRENT && isMicrosoft && currentSkin != null && (
                <div class="ap-actions"><Button disabled={busy} onClick={() => void saveCurrent()}>{t('skins.importCurrent')}</Button></div>
              )}

              {selectedLib != null && (
                <div class="ap-actions">
                  <div class="field-row">
                    <label>{t('skins.variant')}</label>
                    <div class="seg" role="group">
                      <button type="button" aria-pressed={selectedLib.variant === 'classic'} disabled={busy} onClick={() => void setSkinVariant(selectedLib.id, 'classic')}>{t('skins.variantClassic')}</button>
                      <button type="button" aria-pressed={selectedLib.variant === 'slim'} disabled={busy} onClick={() => void setSkinVariant(selectedLib.id, 'slim')}>{t('skins.variantSlim')}</button>
                    </div>
                  </div>

                  {renaming === selectedLib.id ? (
                    <form class="ap-import" onSubmit={(e) => { e.preventDefault(); void commitRename(selectedLib.id) }}>
                      <input class="field" value={renameValue} maxLength={40} aria-label={t('skins.renamePrompt')} autoFocus
                        onInput={(e) => setRenameValue((e.target as HTMLInputElement).value)} />
                      <Button size="sm" type="submit">{t('skins.save')}</Button>
                      <Button size="sm" variant="ghost" onClick={() => setRenaming(null)}>{t('skins.cancel')}</Button>
                    </form>
                  ) : null}

                  <div class="ap-buttons">
                    {isMicrosoft ? (
                      <Button variant="primary" disabled={busy} onClick={() => void applySkin(selectedLib.id)}>{t('skins.apply')}</Button>
                    ) : localInUse === selectedLib.id ? (
                      <Button disabled={busy} onClick={() => void clearLocalSkin()}>{t('skins.clearLocal')}</Button>
                    ) : (
                      <Button variant="primary" disabled={busy} onClick={() => void applySkin(selectedLib.id)}>{t('skins.applyLocal')}</Button>
                    )}
                    <Button variant="ghost" disabled={busy} onClick={() => { setRenameValue(selectedLib.name); setRenaming(selectedLib.id) }}><Pencil size={16} /> {t('skins.rename')}</Button>
                    <Button variant="danger" disabled={busy} onClick={() => setDeleting(selectedLib)}><Trash2 size={16} /> {t('skins.delete')}</Button>
                  </div>
                </div>
              )}
            </div>
          )}

          {tab === 'capes' && (
            <div class="appearance-pane">
              {!isMicrosoft ? (
                <p class="muted">{t('skins.capesOnlyMicrosoft')}</p>
              ) : (
                <>
                  <h2 class="small">{t('skins.capesTitle')}</h2>
                  <div class="skin-grid" role="list">
                    <button type="button" role="listitem" class="skin-card" aria-pressed={previewCape == null} onClick={() => setCapeSel(null)}>
                      <UserRound size={32} />
                      <b class="small">{t('skins.noCape')}</b>
                      {activeCape == null && <Chip tone="ok" icon={Check}>{t('skins.capeActive')}</Chip>}
                    </button>
                    {(prof?.capes ?? []).map((c) => (
                      <button key={c.id} type="button" role="listitem" class="skin-card" aria-pressed={previewCape?.id === c.id} onClick={() => setCapeSel(c.id)}>
                        {c.image != null ? <CapeFront image={c.image} /> : <UserRound size={32} />}
                        <b class="small ellipsis">{c.alias !== '' ? c.alias : '—'}</b>
                        {c.active && <Chip tone="ok" icon={Check}>{t('skins.capeActive')}</Chip>}
                      </button>
                    ))}
                  </div>
                  {(prof?.capes.length ?? 0) === 0 && <p class="muted">{t('skins.noCapes')}</p>}
                  {(previewCape?.id ?? null) !== (activeCape?.id ?? null) && (
                    <div class="ap-actions">
                      <Button variant="primary" disabled={busy} onClick={() => void setCape(previewCape?.id ?? null)}>
                        {previewCape == null ? t('skins.noCape') : t('skins.activate')}
                      </Button>
                    </div>
                  )}
                </>
              )}
            </div>
          )}
        </section>
      </div>

      {deleting != null && (
        <ConfirmDialog
          title={t('skins.deleteTitle')}
          message={t('skins.deleteMessage', { name: deleting.name })}
          confirmLabel={t('skins.deleteConfirm')}
          cancelLabel={t('skins.cancel')}
          onCancel={() => setDeleting(null)}
          onConfirm={() => { const id = deleting.id; setDeleting(null); void removeSkin(id) }}
        />
      )}
    </>
  )
}
