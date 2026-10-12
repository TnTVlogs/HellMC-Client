import type * as THREE from 'three'
import { evalTrack, type BoneSpec, type CosmeticSpec, type CubeSpec, type EmoteSpec, type FaceUv, type PlayerBone } from './bbmodel'

// Cosmètics i emotes de Blockbench → objectes de three.js per a la previsualització (només s'importa sota demanda,
// amb el visor 3D). Els cubs es construeixen a l'espai del MODEL DEL JOC (y cap avall, davant = −z) i es pengen d'un grup
// amb escala (1, −1, −1), que el passa a l'espai de skinview3d (y cap amunt, davant = +z): és una rotació de 180° sobre x.

type Lib = typeof THREE
type V3 = [number, number, number]

interface FaceDef { right: V3; down: V3; normal: V3 }
// Orientació de cada cara vista des de fora (espai del joc). Ordre: nord, est, sud, oest, dalt, baix.
const FACES: FaceDef[] = [
  { right: [1, 0, 0], down: [0, 1, 0], normal: [0, 0, -1] },     // nord (−z, davant del jugador)
  { right: [0, 0, 1], down: [0, 1, 0], normal: [1, 0, 0] },      // est (+x)
  { right: [-1, 0, 0], down: [0, 1, 0], normal: [0, 0, 1] },     // sud (+z)
  { right: [0, 0, -1], down: [0, 1, 0], normal: [-1, 0, 0] },    // oest (−x)
  { right: [1, 0, 0], down: [0, 0, -1], normal: [0, -1, 0] },    // dalt (−y al joc)
  { right: [1, 0, 0], down: [0, 0, 1], normal: [0, 1, 0] }       // baix
]

/** Rectangles de Box UV (disposició de Minecraft), en l'ordre de `FACES`. */
function boxRects(c: CubeSpec): FaceUv[] {
  const { u, v, w, h, d } = c
  const r = (x: number, y: number, rw: number, rh: number): FaceUv => ({ u1: x, v1: y, u2: x + rw, v2: y + rh })
  return [
    r(u + d, v + d, w, h),            // nord
    r(u + d + w, v + d, d, h),        // est
    r(u + 2 * d + w, v + d, w, h),    // sud
    r(u, v + d, d, h),                // oest
    r(u + d, v, w, d),                // dalt
    r(u + d + w, v, w, d)             // baix
  ]
}

function cubeGeometry(lib: Lib, c: CubeSpec, texW: number, texH: number): THREE.BufferGeometry {
  const rects = c.faces != null ? c.faces : boxRects(c)
  const g = c.inflate
  const min: V3 = [c.x - g, c.y - g, c.z - g]
  const size: V3 = [c.w + 2 * g, c.h + 2 * g, c.d + 2 * g]
  const positions: number[] = []
  const uvs: number[] = []
  const indices: number[] = []
  FACES.forEach((face, i) => {
    const rect = rects[i]
    if (rect == null) return
    const centre = min.map((m, k) => m + size[k] / 2 + (face.normal[k] * size[k]) / 2)
    const half = (axis: V3) => axis.map((a, k) => (a * size[k]) / 2) as V3
    const hr = half(face.right)
    const hd = half(face.down)
    const corner = (sr: number, sd: number): V3 => centre.map((p, k) => p + sr * hr[k] + sd * hd[k]) as V3
    const quad: [V3, [number, number]][] = [
      [corner(-1, -1), [rect.u1, rect.v1]],   // dalt-esquerra
      [corner(1, -1), [rect.u2, rect.v1]],    // dalt-dreta
      [corner(1, 1), [rect.u2, rect.v2]],     // baix-dreta
      [corner(-1, 1), [rect.u1, rect.v2]]     // baix-esquerra
    ]
    const base = positions.length / 3
    for (const [p, uv] of quad) {
      positions.push(p[0], p[1], p[2])
      uvs.push(uv[0] / texW, 1 - uv[1] / texH)
    }
    // Sentit dels triangles vist a l'espai de three (escala 1,−1,−1): la normal ha de mirar cap a fora.
    const e1 = [0, 1, 2].map((k) => quad[1][0][k] - quad[0][0][k])
    const e2 = [0, 1, 2].map((k) => quad[3][0][k] - quad[0][0][k])
    const cross = [e1[1] * e2[2] - e1[2] * e2[1], e1[2] * e2[0] - e1[0] * e2[2], e1[0] * e2[1] - e1[1] * e2[0]]
    const n = [cross[0], -cross[1], -cross[2]]
    const out = [face.normal[0], -face.normal[1], -face.normal[2]]
    const flip = n[0] * out[0] + n[1] * out[1] + n[2] * out[2] < 0
    indices.push(...(flip ? [base, base + 2, base + 1, base, base + 3, base + 2] : [base, base + 1, base + 2, base, base + 2, base + 3]))
  })
  const geometry = new lib.BufferGeometry()
  geometry.setAttribute('position', new lib.Float32BufferAttribute(positions, 3))
  geometry.setAttribute('uv', new lib.Float32BufferAttribute(uvs, 2))
  geometry.setIndex(indices)
  geometry.computeVertexNormals()
  return geometry
}

function buildBone(lib: Lib, spec: BoneSpec, material: THREE.Material, texW: number, texH: number): THREE.Group {
  const group = new lib.Group()
  group.position.set(spec.x, spec.y, spec.z)
  group.rotation.set(spec.rx, spec.ry, spec.rz, 'ZYX')          // ModelPart: rotateZYX
  group.scale.setScalar(spec.scale)
  for (const c of spec.cubes) group.add(new lib.Mesh(cubeGeometry(lib, c, texW, texH), material))
  for (const child of spec.children) group.add(buildBone(lib, child, material, texW, texH))
  return group
}

export interface BuiltCosmetic {
  object: THREE.Group
  attach: PlayerBone
  /** Es resol quan la textura és carregada (o ha fallat): abans, un render quiet sortiria sense textura. */
  ready: Promise<void>
  dispose(): void
}

/** Un cosmètic llest per penjar d'un os; `dispose()` allibera geometries, material i textura. */
export function buildCosmetic(lib: Lib, spec: CosmeticSpec): BuiltCosmetic {
  let done: () => void = () => {}
  const ready = new Promise<void>((resolve) => { done = resolve })
  const texture = new lib.TextureLoader().load(spec.texture, () => done(), undefined, () => done())
  texture.magFilter = lib.NearestFilter
  texture.minFilter = lib.NearestFilter
  texture.colorSpace = lib.SRGBColorSpace
  const material = new lib.MeshLambertMaterial({ map: texture, transparent: true, alphaTest: 0.5, side: lib.DoubleSide })
  const object = new lib.Group()
  object.scale.set(1, -1, -1)
  object.add(buildBone(lib, spec.root, material, spec.texW, spec.texH))
  return {
    object,
    attach: spec.attach,
    ready,
    dispose() {
      object.traverse((o) => { if ((o as THREE.Mesh).isMesh) (o as THREE.Mesh).geometry.dispose() })
      material.dispose()
      texture.dispose()
    }
  }
}

// ═══ enquadrament ═══

/** Controls de la càmera del visor (OrbitControls de skinview3d): només el que cal per recentrar. */
export interface FrameControls { target: THREE.Vector3; update(): void }

/**
 * Posa la càmera perquè tots els objectes hi càpiguen sencers: el centre del seu volum envoltant és el nou objectiu i la
 * distància surt de l'alçada i l'amplada reals (un barret alt o unes ales amples allunyen la càmera, un d'ordinari no).
 * Es manté la direcció des de la qual es mirava (o la donada), així no es perd el gir que l'usuari hagi fet.
 */
export function frameCamera(
  lib: Lib, camera: THREE.PerspectiveCamera, controls: FrameControls, objects: THREE.Object3D[], aspect: number,
  options: { direction?: V3; margin?: number } = {}
): void {
  const box = new lib.Box3()
  for (const o of objects) {
    o.updateWorldMatrix(true, true)
    box.expandByObject(o)
  }
  if (box.isEmpty()) return
  const centre = box.getCenter(new lib.Vector3())
  const size = box.getSize(new lib.Vector3())
  const half = Math.tan((camera.fov * Math.PI) / 360)
  const byHeight = size.y / 2 / half
  const byWidth = Math.max(size.x, size.z) / 2 / (half * Math.max(0.2, aspect))
  const distance = (Math.max(byHeight, byWidth) + size.z / 2) * (options.margin ?? 1.12)
  const direction = options.direction != null
    ? new lib.Vector3(...options.direction)
    : camera.position.clone().sub(controls.target)
  if (direction.lengthSq() < 1e-6) direction.set(0.35, 0.2, 1)
  direction.normalize()
  controls.target.copy(centre)
  camera.position.copy(centre).addScaledVector(direction, distance)
  camera.lookAt(centre)
  controls.update()
}

// ═══ emote sobre el jugador de skinview3d ═══

/** Les parts de `PlayerObject.skin` que mou un emote (grups de skinview3d) i el grup al coll per als cosmètics del cos. */
export interface PlayerRig {
  head: THREE.Object3D
  body: THREE.Object3D
  rightArm: THREE.Object3D
  leftArm: THREE.Object3D
  rightLeg: THREE.Object3D
  leftLeg: THREE.Object3D
  /** Grup al coll (pivot del cos al joc): hi pengen els cosmètics de `body`. */
  neck: THREE.Object3D
}

/** Posició de repòs (espai skinview3d) de cada part. El cos de skinview3d gira pel centre, el del joc pel coll. */
const REST: Record<PlayerBone, V3> = {
  head: [0, 0, 0], body: [0, -6, 0], rightArm: [-5, -2, 0], leftArm: [5, -2, 0], rightLeg: [-1.9, -12, -0.1], leftLeg: [1.9, -12, -0.1]
}

/** Aplica l'emote a l'instant `t` (s). Rotacions absolutes, desplaçaments additius; `NaN` = canal sense animar (es deixa el repòs). */
export function applyEmote(lib: Lib, rig: PlayerRig, emote: EmoteSpec | null, t: number): void {
  const bones: PlayerBone[] = ['head', 'body', 'rightArm', 'leftArm', 'rightLeg', 'leftLeg']
  for (const name of bones) {
    const part = rig[name]
    const track = emote?.tracks[name]
    const rest = REST[name]
    let rot = [0, 0, 0]
    let delta = [0, 0, 0]
    if (track != null && emote != null) {
      const v = evalTrack(track, t, emote.period)
      // joc → skinview3d: (x, −y, −z); rotacions (rx, −ry, −rz)
      rot = [Number.isNaN(v[0]) ? 0 : v[0], Number.isNaN(v[1]) ? 0 : -v[1], Number.isNaN(v[2]) ? 0 : -v[2]]
      delta = [Number.isNaN(v[3]) ? 0 : v[3], Number.isNaN(v[4]) ? 0 : -v[4], Number.isNaN(v[5]) ? 0 : -v[5]]
    }
    part.rotation.set(rot[0], rot[1], rot[2], 'ZYX')
    if (name === 'body') {
      const q = new lib.Quaternion().setFromEuler(part.rotation)
      const offset = new lib.Vector3(...rest).applyQuaternion(q)
      part.position.set(offset.x + delta[0], offset.y + delta[1], offset.z + delta[2])
      rig.neck.rotation.copy(part.rotation)
      rig.neck.position.set(delta[0], delta[1], delta[2])
    } else {
      part.position.set(rest[0] + delta[0], rest[1] + delta[1], rest[2] + delta[2])
    }
  }
}
