import { useEffect, useRef, useState } from 'preact/hooks'
import { t } from '../i18n'
import { applyEmote, buildCosmetic, frameCamera } from '../utils/bbthree'
import type { SkinVariant } from '../api'
import type { CosmeticSpec, EmoteSpec } from '../utils/bbmodel'
import type { BuiltCosmetic, PlayerRig } from '../utils/bbthree'

// Visor 3D (skinview3d, MIT; chunk apart carregat sota demanda). Rep PNG com a data URL (el procés
// principal ja els ha baixat: el renderer no fa xarxa). Es pot girar arrossegant i fer zoom amb la roda.
//
// Rendiment: el mòdul es carrega amb `import()` (async, fora del paquet principal) i el visor neix
// amb el renderitzat en pausa; no es pinta res fins que la skin és a la GPU, i mentre tant es mostra
// un indicador de càrrega. El primer fotograma (compilar shaders + pujar textures) és inevitablement
// síncron i pot trigar uns ms: queda amagat darrere l'indicador.

type Viewer = import('skinview3d').SkinViewer
type Lib = typeof import('skinview3d')

/** Escalfa el mòdul (descàrrega + anàlisi del chunk) abans que l'usuari obri la vista. */
export function preloadSkinViewer(): void {
  void import('skinview3d').catch(() => { /* es reintentarà en muntar el visor */ })
}

export interface SkinViewerProps {
  skin: string | null
  variant: SkinVariant
  cape: string | null
  walking: boolean
  /** Dades encara en camí (perfil, textures): es mostra l'indicador de càrrega. */
  loading?: boolean
  /** Armari (docs/client-cosmetics/17): cosmètics penjats dels ossos i emote en bucle (substitueix «walking»). */
  cosmetics?: CosmeticSpec[]
  emote?: EmoteSpec | null
}

/** Espera que el navegador hagi pintat el fotograma amb la skin nova abans de treure l'indicador. */
function afterPaint(): Promise<void> {
  return new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve())))
}

const NO_COSMETICS: CosmeticSpec[] = []

export function SkinViewer({ skin, variant, cape, walking, loading = false, cosmetics = NO_COSMETICS, emote = null }: SkinViewerProps) {
  const holder = useRef<HTMLDivElement>(null)
  const canvas = useRef<HTMLCanvasElement>(null)
  const viewerRef = useRef<Viewer | null>(null)
  const libRef = useRef<Lib | null>(null)
  const threeRef = useRef<typeof import('three') | null>(null)
  const rigRef = useRef<PlayerRig | null>(null)
  /** Hi havia cosmètics (i, per tant, la càmera s'havia enquadrat): en treure'ls cal tornar a enquadrar el jugador sol. */
  const framedRef = useRef(false)
  const [extrasReady, setExtrasReady] = useState(false)
  const [ready, setReady] = useState(false)
  const [failed, setFailed] = useState(false)
  const [skinPending, setSkinPending] = useState(true)

  // Creació única; es destrueix en sortir de la vista.
  useEffect(() => {
    let cancelled = false
    let observer: ResizeObserver | null = null
    ;(async () => {
      try {
        const lib = await import('skinview3d')
        if (cancelled || canvas.current == null || holder.current == null) return
        libRef.current = lib
        const rect = holder.current.getBoundingClientRect()
        // skinview3d registra `touchmove` sense `passive` (Chromium avisa a la consola); el seu handler
        // no fa mai `preventDefault`, així que es pot marcar passiu només durant la creació.
        const target = canvas.current
        const addListener = target.addEventListener.bind(target)
        target.addEventListener = ((type: string, listener: EventListenerOrEventListenerObject, options?: boolean | AddEventListenerOptions) =>
          addListener(type, listener, type === 'touchmove' ? { passive: true } : options)) as typeof target.addEventListener
        let viewer: Viewer
        try {
          viewer = new lib.SkinViewer({
            canvas: target,
            width: Math.max(160, rect.width),
            height: Math.max(220, rect.height),
            zoom: 0.85,
            // En pantalles molt denses el cost de ompliment es dispara sense guany visible en un personatge.
            pixelRatio: Math.min(window.devicePixelRatio || 1, 2),
            renderPaused: true
          })
        } finally {
          delete (target as { addEventListener?: unknown }).addEventListener
        }
        viewer.controls.enablePan = false
        viewer.autoRotate = false
        viewerRef.current = viewer
        const three = await import('three')
        const skinGroup = viewer.playerObject.skin
        const neck = new three.Group()
        skinGroup.add(neck)
        threeRef.current = three
        rigRef.current = {
          head: skinGroup.head, body: skinGroup.body, rightArm: skinGroup.rightArm, leftArm: skinGroup.leftArm,
          rightLeg: skinGroup.rightLeg, leftLeg: skinGroup.leftLeg, neck
        }
        if (cancelled) return
        setExtrasReady(true)
        observer = new ResizeObserver(() => {
          if (holder.current == null || viewer.disposed) return
          const r = holder.current.getBoundingClientRect()
          if (r.width > 0 && r.height > 0) viewer.setSize(r.width, r.height)
        })
        observer.observe(holder.current)
        setReady(true)
      } catch {
        if (!cancelled) setFailed(true)
      }
    })()
    return () => {
      cancelled = true
      observer?.disconnect()
      viewerRef.current?.dispose()
      viewerRef.current = null
    }
  }, [])

  // Skin: es carrega en segon pla; el visor no pinta fins que és llesta i l'indicador es treu després del primer pintat.
  useEffect(() => {
    const viewer = viewerRef.current
    if (!ready || viewer == null) return
    let stale = false
    setSkinPending(true)
    void (async () => {
      try {
        if (skin == null) viewer.resetSkin()
        else await viewer.loadSkin(skin, { model: variant === 'slim' ? 'slim' : 'default' })
        if (stale || viewer.disposed) return
        viewer.renderPaused = false
        await afterPaint()
      } catch {
        if (!stale) setFailed(true)
      } finally {
        if (!stale) setSkinPending(false)
      }
    })()
    return () => { stale = true }
  }, [ready, skin, variant])

  useEffect(() => {
    const viewer = viewerRef.current
    if (!ready || viewer == null) return
    if (cape == null) viewer.resetCape()
    else void viewer.loadCape(cape).catch(() => { /* capa il·legible: es deixa sense */ })
  }, [ready, cape])

  useEffect(() => {
    const viewer = viewerRef.current
    const lib = libRef.current
    if (!ready || viewer == null || lib == null) return
    const three = threeRef.current
    const rig = rigRef.current
    if (emote != null && three != null && rig != null) {
      // Emote del joc en bucle: es calcula a mà cada fotograma (rotacions absolutes, desplaçaments additius).
      const started = performance.now()
      const play = new (class extends lib.PlayerAnimation {
        protected animate(): void {
          applyEmote(three, rig, emote, (performance.now() - started) / 1000)
        }
      })()
      viewer.animation = play
      return () => {
        applyEmote(three, rig, null, 0)
        viewer.animation = null
      }
    }
    viewer.animation = walking ? new lib.WalkingAnimation() : new lib.IdleAnimation()
  }, [ready, walking, emote, extrasReady])

  // Cosmètics: es pengen de l'os on s'enganxen; en canviar la llista es destrueixen i es reconstrueixen.
  useEffect(() => {
    const three = threeRef.current
    const rig = rigRef.current
    if (!extrasReady || three == null || rig == null) return
    const built: BuiltCosmetic[] = []
    for (const spec of cosmetics) {
      try {
        const item = buildCosmetic(three, spec)
        rig[spec.attach === 'body' ? 'neck' : spec.attach].add(item.object)
        built.push(item)
      } catch { /* cosmètic il·legible: s'omet de la vista prèvia */ }
    }
    // Enquadrament: la càmera s'ajusta a l'alçada i l'amplada reals del jugador amb els cosmètics (un barret alt, unes ales amples),
    // mantenint el gir que l'usuari hagi fet. Sense cosmètics no es toca el zoom per defecte (excepte en treure'ls, per tornar-hi).
    const viewer = viewerRef.current
    if (viewer != null && holder.current != null && (built.length > 0 || framedRef.current)) {
      const r = holder.current.getBoundingClientRect()
      frameCamera(three, viewer.camera, viewer.controls, [viewer.playerObject, ...built.map((b) => b.object)], r.height > 0 ? r.width / r.height : 1)
      framedRef.current = built.length > 0
    }
    return () => {
      for (const item of built) { item.object.removeFromParent(); item.dispose() }
    }
  }, [extrasReady, cosmetics])

  const busy = !failed && (!ready || skinPending || loading)

  return (
    <div class="skin-viewer" ref={holder} aria-busy={busy}>
      <canvas ref={canvas} aria-label={t('skins.previewing')} />
      {failed && <p class="muted small skin-viewer-msg">{t('skins.viewerError')}</p>}
      <div class={`skin-viewer-loading${busy ? ' on' : ''}`} role="status" aria-live="polite" aria-hidden={!busy}>
        <div class="spinner" />
        <span class="muted xs">{t('skins.loading')}</span>
      </div>
    </div>
  )
}
