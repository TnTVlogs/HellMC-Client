// Lector de .bbmodel de Blockbench per a la PREVISUALITZACIÓ del launcher (docs/client-cosmetics/16-format-blockbench.md).
// És el mateix algorisme que `HellMC-Spike/agent/.../Bb.java` (que és el que mana al joc): si allà canvia una convenció
// (signes, pivots, límits), aquí també. Sense dependències de three.js: només dades (es pot provar amb vitest).

/** Convenció de signes Blockbench → model del joc (hipòtesi de treball, com a `Bb.ROT_SIGN`/`POS_SIGN`). */
const ROT_SIGN = [-1, -1, 1]
const POS_SIGN = [1, -1, -1]

const MAX_BYTES = 1 << 20
const MAX_CUBES = 64
const MAX_BONES = 16
const MAX_ANIMATIONS = 16
const MAX_KEYFRAMES = 200
const MAX_TEXTURE = 256
const MAX_SECONDS = 30
const SAMPLE_DT = 1 / 24

/** Pivots (a l'espai de Blockbench) dels ossos del jugador. */
const BONE_PIVOT: Record<string, [number, number, number]> = {
  head: [0, 24, 0],
  body: [0, 24, 0],
  rightarm: [-5, 22, 0],
  leftarm: [5, 22, 0],
  rightleg: [-1.9, 12, 0],
  leftleg: [1.9, 12, 0]
}

export type PlayerBone = 'head' | 'body' | 'rightArm' | 'leftArm' | 'rightLeg' | 'leftLeg'
export const PLAYER_BONES: PlayerBone[] = ['head', 'body', 'rightArm', 'leftArm', 'rightLeg', 'leftLeg']

/** Rectangle d'UV d'una cara en píxels de textura; els valors invertits giren la imatge. */
export interface FaceUv { u1: number; v1: number; u2: number; v2: number }
/** Ordre de `faces`: nord, est, sud, oest, dalt, baix. */
export interface CubeSpec { x: number; y: number; z: number; w: number; h: number; d: number; u: number; v: number; inflate: number; faces: (FaceUv | null)[] | null }
export interface BoneSpec { name: string; x: number; y: number; z: number; rx: number; ry: number; rz: number; scale: number; cubes: CubeSpec[]; children: BoneSpec[] }
export interface CosmeticSpec { name: string; texture: string; texW: number; texH: number; attach: PlayerBone; root: BoneSpec }
/** Keyframes {t, rx, ry, rz, dx, dy, dz} (radians / píxels del joc); `NaN` = canal sense animar. */
export interface EmoteTrack { frames: number[][] }
export interface EmoteSpec { name: string; duration: number; period: number; tracks: Partial<Record<PlayerBone, EmoteTrack>> }

type Json = Record<string, unknown>

const obj = (o: unknown): Json => (o != null && typeof o === 'object' && !Array.isArray(o) ? (o as Json) : {})
const arr = (o: unknown): unknown[] => (Array.isArray(o) ? o : [])
/** Número o text numèric (Blockbench desa així els valors dels keyframes: `"-166"`); `def` si no ho és (p. ex. Molang). */
const num = (o: unknown, def: number): number => {
  const n = typeof o === 'string' && o.trim() !== '' ? Number(o) : o
  return typeof n === 'number' && Number.isFinite(n) ? n : def
}
const str = (o: unknown, def: string): string => (typeof o === 'string' ? o : def)
const vec = (o: unknown, n: number): number[] => Array.from({ length: n }, (_, i) => num(arr(o)[i], 0))

function parseRoot(json: string): Json {
  if (json.length > MAX_BYTES) throw new Error('fitxer massa gran')
  const root: unknown = JSON.parse(json)
  if (root == null || typeof root !== 'object' || Array.isArray(root)) throw new Error('no és un objecte JSON')
  return root as Json
}

/** `"Right_Arm"` → `"rightarm"` */
const boneKey = (name: string): string => name.toLowerCase().replace(/[^a-z0-9]/g, '')

function canonical(key: string): PlayerBone {
  switch (key) {
    case 'rightarm': return 'rightArm'
    case 'leftarm': return 'leftArm'
    case 'rightleg': return 'rightLeg'
    case 'leftleg': return 'leftLeg'
    default: return key as PlayerBone
  }
}

// ═══ cosmètic ═══

export function parseCosmetic(json: string, attach = 'head', offset: number[] = [0, 0, 0], scale = 1): CosmeticSpec {
  if (!(scale > 0.05 && scale < 20)) throw new Error(`escala fora de rang: ${scale}`)
  const root = parseRoot(json)
  const boxUvDefault = obj(root.meta).box_uv === true
  const res = obj(root.resolution)
  const texW = Math.trunc(num(res.width, 0))
  const texH = Math.trunc(num(res.height, 0))
  if (texW <= 0 || texH <= 0 || texW > MAX_TEXTURE || texH > MAX_TEXTURE) throw new Error(`resolució invàlida ${texW}x${texH}`)
  const textures = arr(root.textures)
  if (textures.length !== 1) throw new Error(`cal exactament 1 textura (n'hi ha ${textures.length})`)
  const source = str(obj(textures[0]).source, '')
  if (!source.startsWith('data:image/png;base64,')) throw new Error('la textura ha d\'anar incrustada (PNG base64)')

  const key = boneKey(attach)
  const pivot = BONE_PIVOT[key]
  if (pivot == null) throw new Error(`os desconegut: ${attach}`)

  const elements = new Map<string, Json>()
  for (const e of arr(root.elements)) {
    const el = obj(e)
    if (str(el.type, 'cube') !== 'cube') throw new Error('només s\'admeten cubs')
    elements.set(str(el.uuid, ''), el)
  }
  if (elements.size > MAX_CUBES) throw new Error('massa cubs')

  const off = [0, 1, 2].map((i) => num(offset[i], 0))
  const counter = { n: 0 }
  const roots = arr(root.outliner).map((node) => toBone(node, pivot, off, elements, counter, boxUvDefault))
  if (roots.length === 0) throw new Error('el model no té cap element')
  const scaled = roots.map((r) => ({ ...r, scale }))
  const rootBone: BoneSpec = { name: 'root', x: 0, y: 0, z: 0, rx: 0, ry: 0, rz: 0, scale: 1, cubes: [], children: scaled }
  return { name: str(root.name, 'cosmetic'), texture: source, texW, texH, attach: canonical(key), root: rootBone }
}

function toBone(node: unknown, parentOrigin: number[], off: number[], elements: Map<string, Json>, counter: { n: number }, boxUvDefault: boolean): BoneSpec {
  if (++counter.n > MAX_BONES + MAX_CUBES) throw new Error('massa nodes')
  if (typeof node === 'string') {
    const el = elements.get(node)
    if (el == null) throw new Error(`element desconegut ${node}`)
    return element(el, parentOrigin, off, boxUvDefault)
  }
  const group = obj(node)
  const origin = vec(group.origin, 3).map((v, i) => v + off[i])
  const rot = vec(group.rotation, 3)
  const children = arr(group.children).map((c) => toBone(c, origin, off, elements, counter, boxUvDefault))
  return bone(str(group.name, ''), origin, parentOrigin, rot, [], children)
}

function element(el: Json, parentOrigin: number[], off: number[], boxUvDefault: boolean): BoneSpec {
  const from = vec(el.from, 3)
  const to = vec(el.to, 3)
  const rawOrigin = vec(el.origin, 3)
  const origin = rawOrigin.map((v, i) => v + off[i])
  const rot = vec(el.rotation, 3)
  const boxUv = typeof el.box_uv === 'boolean' ? el.box_uv : boxUvDefault
  let faces: (FaceUv | null)[] | null = null
  let u = 0
  let v = 0
  if (boxUv) {
    const uv = vec(el.uv_offset, 2)
    u = Math.trunc(uv[0])
    v = Math.trunc(uv[1])
  } else {
    const f = obj(el.faces)
    faces = ['north', 'east', 'south', 'west', 'up', 'down'].map((name) => {
      const r = arr(obj(f[name]).uv)
      return r.length >= 4 ? { u1: num(r[0], 0), v1: num(r[1], 0), u2: num(r[2], 0), v2: num(r[3], 0) } : null
    })
  }
  const cube: CubeSpec = {
    x: from[0] - rawOrigin[0], y: rawOrigin[1] - to[1], z: from[2] - rawOrigin[2],
    w: to[0] - from[0], h: to[1] - from[1], d: to[2] - from[2], u, v, inflate: num(el.inflate, 0), faces
  }
  return bone(str(el.name, ''), origin, parentOrigin, rot, [cube], [])
}

function bone(name: string, origin: number[], parentOrigin: number[], rotDeg: number[], cubes: CubeSpec[], children: BoneSpec[]): BoneSpec {
  const rad = (i: number) => (rotDeg[i] * ROT_SIGN[i] * Math.PI) / 180
  return {
    name, x: origin[0] - parentOrigin[0], y: parentOrigin[1] - origin[1], z: origin[2] - parentOrigin[2],
    rx: rad(0), ry: rad(1), rz: rad(2), scale: 1, cubes, children
  }
}

// ═══ emotes ═══

interface Key { time: number; v: number[]; interpolation: string }

export function parseEmotes(json: string): EmoteSpec[] {
  const root = parseRoot(json)
  const animations = arr(root.animations)
  if (animations.length > MAX_ANIMATIONS) throw new Error('massa animacions')
  return animations.map((a) => {
    const anim = obj(a)
    const length = num(anim.length, 0)
    if (!(length > 0 && length <= MAX_SECONDS)) throw new Error(`durada invàlida: ${length}`)
    const tracks: EmoteSpec['tracks'] = {}
    for (const animatorObj of Object.values(obj(anim.animators))) {
      const animator = obj(animatorObj)
      const key = boneKey(str(animator.name, ''))
      if (BONE_PIVOT[key] == null) continue
      const track = sampleTrack(arr(animator.keyframes), length)
      if (track != null) tracks[canonical(key)] = track
    }
    const play = str(anim.loop, 'once') === 'loop' ? length * Math.max(1, Math.ceil(4 / length)) : length
    return { name: str(anim.name, 'emote'), duration: play, period: length, tracks }
  })
}

function sampleTrack(keyframes: unknown[], length: number): EmoteTrack | null {
  const channels: Record<string, Key[]> = {}
  let count = 0
  for (const k of keyframes) {
    const kf = obj(k)
    const channel = str(kf.channel, '')
    if (channel !== 'rotation' && channel !== 'position') continue
    const pts = arr(kf.data_points)
    if (pts.length === 0) continue
    const p = obj(pts[0])
    const v = [p.x, p.y, p.z].map((c) => num(c, Number.NaN))
    if (v.some(Number.isNaN)) throw new Error('keyframe no numèric (Molang?)')
    ;(channels[channel] ??= []).push({ time: num(kf.time, 0), v, interpolation: str(kf.interpolation, 'linear') })
    if (++count > MAX_KEYFRAMES * 2) throw new Error('massa keyframes')
  }
  if (Object.keys(channels).length === 0) return null
  for (const list of Object.values(channels)) list.sort((a, b) => a.time - b.time)
  const n = Math.max(2, Math.round(length / SAMPLE_DT))
  const frames: number[][] = []
  for (let i = 0; i < n; i++) {
    const t = (length * i) / n
    const rot = sampleChannel(channels.rotation, t)
    const pos = sampleChannel(channels.position, t)
    const row = [t]
    for (let k = 0; k < 3; k++) row.push(rot == null ? Number.NaN : (rot[k] * ROT_SIGN[k] * Math.PI) / 180)
    for (let k = 0; k < 3; k++) row.push(pos == null ? Number.NaN : pos[k] * POS_SIGN[k])
    frames.push(row)
  }
  return { frames }
}

function sampleChannel(keys: Key[] | undefined, t: number): number[] | null {
  if (keys == null || keys.length === 0) return null
  if (t <= keys[0].time) return [...keys[0].v]
  const last = keys.length - 1
  if (t >= keys[last].time) return [...keys[last].v]
  let i = 0
  while (i < last && keys[i + 1].time <= t) i++
  const a = keys[i]
  const b = keys[i + 1]
  const u = (t - a.time) / (b.time - a.time)
  if (a.interpolation === 'step') return [...a.v]
  if (a.interpolation === 'catmullrom') {
    const p0 = keys[Math.max(0, i - 1)].v
    const p3 = keys[Math.min(last, i + 2)].v
    return [0, 1, 2].map((k) => catmull(p0[k], a.v[k], b.v[k], p3[k], u))
  }
  return [0, 1, 2].map((k) => a.v[k] + (b.v[k] - a.v[k]) * u)   // lineal (i bezier, tractat com a lineal)
}

function catmull(p0: number, p1: number, p2: number, p3: number, u: number): number {
  const u2 = u * u
  const u3 = u2 * u
  return 0.5 * (2 * p1 + (-p0 + p2) * u + (2 * p0 - 5 * p1 + 4 * p2 - p3) * u2 + (-p0 + 3 * p1 - 3 * p2 + p3) * u3)
}

/** Valor {rx, ry, rz, dx, dy, dz} de la pista a l'instant `t` (`smoothstep` entre keyframes, com `Emotes.Track.at` al joc). */
export function evalTrack(track: EmoteTrack, t: number, period: number): number[] {
  const frames = track.frames
  const n = frames.length
  const tt = period > 0 ? t % period : t
  let i = 0
  while (i < n - 1 && frames[i + 1][0] <= tt) i++
  const a = frames[i]
  const b = frames[(i + 1) % n]
  const t0 = a[0]
  const t1 = i + 1 < n ? b[0] : period
  let u = t1 > t0 ? Math.min(1, Math.max(0, (tt - t0) / (t1 - t0))) : 0
  u = u * u * (3 - 2 * u)
  return [1, 2, 3, 4, 5, 6].map((k) => a[k] + (b[k] - a[k]) * u)
}
