import { useEffect, useRef, useState } from 'preact/hooks'
import { t } from '../i18n'
import { Button } from './Button'
import { perfMode, type PerformanceMode } from '../stores/ui'
import steveSkin from '../assets/steve.png'
import { applyEmote, buildCosmetic, frameCamera } from '../utils/bbthree'
import type { SkinVariant } from '../api'
import type { CosmeticSpec, EmoteSpec } from '../utils/bbmodel'
import type { BuiltCosmetic, PlayerRig } from '../utils/bbthree'

// Visor 3D (skinview3d, MIT; chunk apart carregat sota demanda). Rep PNG com a data URL (el procés
// principal ja els ha baixat: el renderer no fa xarxa). Es pot girar arrossegant i fer zoom amb la roda.
//
// Persistència: hi ha UN sol visor (WebGL, shaders, textures) per a tota l'aplicació. Es crea en segon pla poc després
// d'arrencar (`preloadSkinViewer`) i cada vista (Aparença, Armari) hi enganxa el seu llenç en entrar i el pausa en
// sortir; la skin i la capa ja carregades es reaprofiten. Així entrar a una vista no torna a crear res ni mostra
// l'indicador de càrrega. El primer fotograma (compilar shaders + pujar textures) passa un cop, amagat.

type Viewer = import('skinview3d').SkinViewer
type Lib = typeof import('skinview3d')
type Three = typeof import('three')
type V3 = import('three').Vector3

interface Shared {
  lib: Lib
  three: Three
  viewer: Viewer
  canvas: HTMLCanvasElement
  rig: PlayerRig
  /** Postura inicial de la càmera: es restaura en entrar a cada vista (els cosmètics l'enquadren). */
  home: { position: V3; target: V3 }
  /** Skin i capa ara a la GPU (claus), per no tornar-les a carregar si no canvien. */
  skinKey: string | null
  capeKey: string | null
  /** Instància de `SkinViewer` que el té enganxat ara mateix. */
  owner: object | null
  createdAt: number
  /** Mínim de ms entre dos fotogrames. */
  frameInterval: number
  /** Mode de rendiment aplicat ara (fotogrames per segon màxims i resolució). */
  quality: PerformanceMode | null
}

// Rendiment (Configuració › Launcher › Rendiment): un personatge no necessita 60 fps ni resolució nativa; el mode «Activat»
// és el més estalviador i «Desactivat» el més fi. El visor també s'atura sol si la finestra no és visible.
const QUALITY: Record<PerformanceMode, { fps: number; maxPixelRatio: number }> = {
  off: { fps: 60, maxPixelRatio: 2 },
  auto: { fps: 30, maxPixelRatio: 1.5 },
  on: { fps: 20, maxPixelRatio: 1 }
}

function applyQuality(s: Shared, mode: PerformanceMode): void {
  if (s.quality === mode) return
  s.quality = mode
  const { fps, maxPixelRatio } = QUALITY[mode]
  s.frameInterval = 1000 / fps
  s.viewer.pixelRatio = Math.min(window.devicePixelRatio || 1, maxPixelRatio)
}

let shared: Shared | null = null
let creating: Promise<Shared> | null = null

// Recuperació: si el context WebGL es perd (controlador, GPU, suspensió) el visor es descarta i es recrea sol. Si falla
// MAX_FAILURES vegades seguides, es deixa d'insistir i la vista ofereix un botó per recarregar-lo.
const MAX_FAILURES = 3
/** Un visor que ha viscut tant de temps es considera sa: la seva pèrdua de context compta com a fallada nova, no consecutiva. */
const HEALTHY_MS = 10_000
let failures = 0
const subscribers = new Set<() => void>()
const notifySubscribers = () => subscribers.forEach((fn) => fn())

function retire(s: Shared): void {
  if (shared !== s) return
  shared = null
  failures = Date.now() - s.createdAt > HEALTHY_MS ? 1 : failures + 1
  try { s.viewer.dispose() } catch { /* el context ja no hi és */ }
  s.canvas.remove()
  notifySubscribers()
}

const skinKeyOf = (skin: string | null, variant: SkinVariant) => (skin == null ? 'steve' : `${variant}|${skin}`)

async function createShared(): Promise<Shared> {
  const [lib, three] = await Promise.all([import('skinview3d'), import('three')])
  const canvas = document.createElement('canvas')
  canvas.setAttribute('aria-label', t('skins.previewing'))
  // skinview3d registra `touchmove` sense `passive` (Chromium avisa a la consola); el seu handler
  // no fa mai `preventDefault`, així que es pot marcar passiu només durant la creació.
  const addListener = canvas.addEventListener.bind(canvas)
  canvas.addEventListener = ((type: string, listener: EventListenerOrEventListenerObject, options?: boolean | AddEventListenerOptions) =>
    addListener(type, listener, type === 'touchmove' ? { passive: true } : options)) as typeof canvas.addEventListener
  let viewer: Viewer
  try {
    viewer = new lib.SkinViewer({
      canvas,
      width: 320,
      height: 420,
      zoom: 0.85,
      // En pantalles molt denses el cost de ompliment es dispara sense guany visible en un personatge.
      pixelRatio: 1,
      renderPaused: true
    })
  } finally {
    delete (canvas as { addEventListener?: unknown }).addEventListener
  }
  viewer.controls.enablePan = false
  viewer.autoRotate = false
  const skinGroup = viewer.playerObject.skin
  const neck = new three.Group()
  skinGroup.add(neck)
  const rig: PlayerRig = {
    head: skinGroup.head, body: skinGroup.body, rightArm: skinGroup.rightArm, leftArm: skinGroup.leftArm,
    rightLeg: skinGroup.rightLeg, leftLeg: skinGroup.leftLeg, neck
  }
  // Steve ja carregat i un fotograma pintat (pausat): shaders compilats i textures a la GPU abans que ningú miri.
  await viewer.loadSkin(steveSkin, { model: 'default' })
  viewer.render()
  const made: Shared = {
    lib, three, viewer, canvas, rig,
    home: { position: viewer.camera.position.clone(), target: viewer.controls.target.clone() },
    skinKey: 'steve', capeKey: null, owner: null, createdAt: Date.now(), frameInterval: 0, quality: null
  }
  applyQuality(made, perfMode.value)
  // Límit de fotogrames: `draw` de skinview3d es reprograma sol; si encara no toca, només reprograma i no pinta (el rellotge
  // de les animacions es llegeix en pintar, així que la velocitat no canvia, només la fluïdesa).
  const viewerLoop = viewer as unknown as { draw(): void; animationID: number | null }
  const draw = viewerLoop.draw.bind(viewer)
  let last = 0
  viewerLoop.draw = () => {
    const now = performance.now()
    if (now - last < made.frameInterval - 1) {
      viewerLoop.animationID = window.requestAnimationFrame(() => viewerLoop.draw())
      return
    }
    last = now
    draw()
  }
  // Finestra minimitzada o amagada: no es pinta res.
  document.addEventListener('visibilitychange', () => {
    if (shared !== made || made.owner == null) return
    made.viewer.renderPaused = document.hidden
  })
  canvas.addEventListener('webglcontextlost', (event) => { event.preventDefault(); retire(made) })
  return made
}

function ensureShared(): Promise<Shared> {
  if (shared != null) return Promise.resolve(shared)
  creating ??= createShared().then((s) => { shared = s; return s }).finally(() => { creating = null })
  return creating
}

/** Crea el visor en segon pla (descàrrega del mòdul, WebGL, shaders) abans que l'usuari obri la vista. */
export function preloadSkinViewer(): void {
  void ensureShared().catch(() => { /* es reintentarà en muntar el visor */ })
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
  const slot = useRef<HTMLDivElement>(null)
  const viewerRef = useRef<Viewer | null>(null)
  const libRef = useRef<Lib | null>(null)
  const threeRef = useRef<Three | null>(null)
  const rigRef = useRef<PlayerRig | null>(null)
  /** Hi havia cosmètics (i, per tant, la càmera s'havia enquadrat): en treure'ls cal tornar a enquadrar el jugador sol. */
  const framedRef = useRef(false)
  // Si el visor ja existeix, la vista neix llesta (sense indicador de càrrega).
  const [extrasReady, setExtrasReady] = useState(shared != null)
  const [ready, setReady] = useState(shared != null)
  const [failed, setFailed] = useState(false)
  /** Es puja per tornar a enganxar el visor (després d'una pèrdua de context, d'un error de creació o del botó). */
  const [attempt, setAttempt] = useState(0)
  const [skinPending, setSkinPending] = useState(() => shared?.skinKey !== skinKeyOf(skin, variant))

  // Canvi del mode de rendiment amb el visor ja creat.
  useEffect(() => { if (shared != null) applyQuality(shared, perfMode.value) }, [perfMode.value])

  useEffect(() => {
    const retry = () => setAttempt((n) => n + 1)
    subscribers.add(retry)
    return () => { subscribers.delete(retry) }
  }, [])

  // Enganxa el visor compartit a aquesta vista; en sortir, el pausa i el desenganxa (no es destrueix).
  useEffect(() => {
    const me = {}
    let cancelled = false
    let observer: ResizeObserver | null = null
    let timer: number | undefined
    if (shared == null) {
      // El visor s'ha perdut o encara no existeix: la vista torna a l'estat de càrrega fins que n'hi hagi un de nou.
      setReady(false)
      setExtrasReady(false)
      setSkinPending(true)
      if (failures >= MAX_FAILURES) { setFailed(true); return }
    }
    function attach(s: Shared) {
      if (cancelled || slot.current == null || holder.current == null) return
      s.owner = me
      slot.current.replaceChildren(s.canvas)
      const rect = holder.current.getBoundingClientRect()
      s.viewer.setSize(Math.max(160, rect.width), Math.max(220, rect.height))
      s.viewer.camera.position.copy(s.home.position)
      s.viewer.controls.target.copy(s.home.target)
      s.viewer.controls.update()
      viewerRef.current = s.viewer
      libRef.current = s.lib
      threeRef.current = s.three
      rigRef.current = s.rig
      observer = new ResizeObserver(() => {
        if (holder.current == null || s.viewer.disposed) return
        const r = holder.current.getBoundingClientRect()
        if (r.width > 0 && r.height > 0) s.viewer.setSize(r.width, r.height)
      })
      observer.observe(holder.current)
      setFailed(false)
      setExtrasReady(true)
      setReady(true)
    }
    if (shared != null) attach(shared)
    else {
      ensureShared().then(attach, () => {
        failures += 1
        if (cancelled) return
        if (failures >= MAX_FAILURES) setFailed(true)
        else timer = window.setTimeout(() => setAttempt((n) => n + 1), 500 * failures)
      })
    }
    return () => {
      cancelled = true
      window.clearTimeout(timer)
      observer?.disconnect()
      const s = shared
      if (s != null && s.owner === me) {
        s.owner = null
        s.viewer.renderPaused = true
        s.viewer.animation = null
        s.canvas.remove()
      }
      viewerRef.current = null
    }
  }, [attempt])

  function reload() {
    failures = 0
    setFailed(false)
    setAttempt((n) => n + 1)
  }

  // Skin: si ja és la que hi ha a la GPU no es toca; si no, es carrega en segon pla i l'indicador es treu després del primer pintat.
  useEffect(() => {
    const viewer = viewerRef.current
    const s = shared
    if (!ready || viewer == null || s == null) return
    const key = skinKeyOf(skin, variant)
    if (s.skinKey === key) {
      viewer.renderPaused = false
      setSkinPending(false)
      return
    }
    let stale = false
    setSkinPending(true)
    void (async () => {
      try {
        // Sense skin (Mojang inaccessible i res a la caché) o amb una d'il·legible: Steve.
        const steve = () => viewer.loadSkin(steveSkin, { model: 'default' })
        if (skin == null) await steve()
        else await viewer.loadSkin(skin, { model: variant === 'slim' ? 'slim' : 'default' }).catch(steve)
        s.skinKey = key
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
    const s = shared
    if (!ready || viewer == null || s == null || s.capeKey === cape) return
    s.capeKey = cape
    if (cape == null) viewer.resetCape()
    else void viewer.loadCape(cape).catch(() => { s.capeKey = null /* capa il·legible: es deixa sense */ })
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
      <div class="skin-viewer-slot" ref={slot} />
      {failed && (
        <div class="skin-viewer-msg">
          <p class="muted small">{t('skins.viewerError')}</p>
          <Button size="sm" onClick={reload}>{t('skins.viewerReload')}</Button>
        </div>
      )}
      <div class={`skin-viewer-loading${busy ? ' on' : ''}`} role="status" aria-live="polite" aria-hidden={!busy}>
        <div class="spinner" />
        <span class="muted xs">{t('skins.loading')}</span>
      </div>
    </div>
  )
}
