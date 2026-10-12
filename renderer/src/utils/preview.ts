import type * as THREE from 'three'
import type { CosmeticSpec } from './bbmodel'
import { buildCosmetic, frameCamera } from './bbthree'

// Previsualitzacions quietes dels cosmètics (les targetes de l'Armari i el menú del joc): un render fet una sola vegada amb el
// mateix visor 3D, sobre un maniquí neutre perquè no depengui de la skin de ningú, i desat com a PNG (`<id>.preview.png`).
// Així la llista no ha de renderitzar res en viu. L'enquadrament surt de la mida real del cosmètic (un barret alt o unes ales
// amples allunyen la càmera), centrat sobre la part del cos on va.

type Lib = typeof import('skinview3d')
type Viewer = import('skinview3d').SkinViewer
type V3 = [number, number, number]

const SIZE = 160
const READY_TIMEOUT_MS = 4000

/** Maniquí: un color pla (la textura de skin 64×64 sencera) perquè només es vegi el cosmètic. */
function mannequinSkin(): string {
  const c = document.createElement('canvas')
  c.width = 64
  c.height = 64
  const g = c.getContext('2d')
  if (g == null) throw new Error('canvas no disponible')
  g.fillStyle = '#8e97a8'
  g.fillRect(0, 0, 64, 64)
  return c.toDataURL('image/png')
}

/** Parts del jugador que cal incloure a l'enquadrament i direcció des d'on es mira, segons la ranura/l'os. */
function focusFor(attach: CosmeticSpec['attach']): { parts: ('head' | 'body' | 'leftLeg' | 'rightLeg')[]; direction: V3 } {
  switch (attach) {
    case 'head': return { parts: ['head'], direction: [0.55, 0.25, 1] }
    case 'body': return { parts: ['body', 'head'], direction: [0.6, 0.2, 1] }
    case 'leftLeg':
    case 'rightLeg': return { parts: ['leftLeg', 'rightLeg'], direction: [0.55, 0.15, 1] }
    default: return { parts: ['body', 'head'], direction: [0.6, 0.2, 1] }
  }
}

export interface Previewer {
  /** PNG com a data URL; `null` si el cosmètic no es pot construir. */
  render(spec: CosmeticSpec, view?: 'front' | 'back'): Promise<string | null>
  dispose(): void
}

export async function createPreviewer(): Promise<Previewer> {
  const lib: Lib = await import('skinview3d')
  const three = await import('three')
  const canvas = document.createElement('canvas')
  const viewer: Viewer = new lib.SkinViewer({
    canvas, width: SIZE, height: SIZE, pixelRatio: 1, preserveDrawingBuffer: true, renderPaused: true, enableControls: false
  })
  viewer.animation = null
  await viewer.loadSkin(mannequinSkin(), { model: 'default' })
  const skinGroup = viewer.playerObject.skin
  const neck = new three.Group()
  skinGroup.add(neck)
  const rig = { head: skinGroup.head, body: skinGroup.body, leftLeg: skinGroup.leftLeg, rightLeg: skinGroup.rightLeg, rightArm: skinGroup.rightArm, leftArm: skinGroup.leftArm, neck }
  let disposed = false

  return {
    async render(spec, view = 'front') {
      if (disposed) return null
      let built: ReturnType<typeof buildCosmetic> | null = null
      try {
        built = buildCosmetic(three, spec)
        const parent: THREE.Object3D = spec.attach === 'body' ? rig.neck : rig[spec.attach]
        parent.add(built.object)
        await Promise.race([built.ready, new Promise<void>((resolve) => setTimeout(resolve, READY_TIMEOUT_MS))])
        const { parts, direction } = focusFor(spec.attach)
        const objects: THREE.Object3D[] = [built.object, ...parts.map((p) => rig[p])]
        frameCamera(three, viewer.camera, viewer.controls, objects, 1, {
          direction: view === 'back' ? [-direction[0], direction[1], -direction[2]] : direction,
          margin: 1.18
        })
        viewer.render()
        return canvas.toDataURL('image/png')
      } catch {
        return null
      } finally {
        if (built != null) {
          built.object.removeFromParent()
          built.dispose()
        }
      }
    },
    dispose() {
      disposed = true
      viewer.dispose()
    }
  }
}

/** Quin lloc del cos mira cap enrere (ales, motxilles): el render es fa des del darrere perquè es vegi el cosmètic. */
export function previewView(slot: string | null): 'front' | 'back' {
  return slot === 'back' ? 'back' : 'front'
}
