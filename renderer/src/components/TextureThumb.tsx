import { useEffect, useRef } from 'preact/hooks'

// Miniatures 2D (canvas, sense llibreries): cara d'una skin (amb la capa del barret) i part davantera d'una capa.

function drawFrom(image: string, paint: (ctx: CanvasRenderingContext2D, img: HTMLImageElement) => void, canvas: HTMLCanvasElement | null, cancelled: () => boolean) {
  if (canvas == null) return
  const ctx = canvas.getContext('2d')
  if (ctx == null) return
  ctx.imageSmoothingEnabled = false
  const img = new Image()
  img.onload = () => {
    if (cancelled()) return
    ctx.clearRect(0, 0, canvas.width, canvas.height)
    paint(ctx, img)
  }
  img.src = image
}

/** Cara (8×8 a 8,8) + capa exterior del cap (8×8 a 40,8). */
export function SkinFace({ image, size = 56 }: { image: string; size?: number }) {
  const ref = useRef<HTMLCanvasElement>(null)
  useEffect(() => {
    let stop = false
    drawFrom(image, (ctx, img) => {
      ctx.drawImage(img, 8, 8, 8, 8, 0, 0, 64, 64)
      ctx.drawImage(img, 40, 8, 8, 8, 0, 0, 64, 64)
    }, ref.current, () => stop)
    return () => { stop = true }
  }, [image])
  return <canvas ref={ref} class="thumb" width={64} height={64} style={{ width: size, height: size }} aria-hidden="true" />
}

/** Part exterior davantera de la capa (10×16 a 1,1 de la textura 64×32). */
export function CapeFront({ image, height = 64 }: { image: string; height?: number }) {
  const ref = useRef<HTMLCanvasElement>(null)
  useEffect(() => {
    let stop = false
    drawFrom(image, (ctx, img) => ctx.drawImage(img, 1, 1, 10, 16, 0, 0, 80, 128), ref.current, () => stop)
    return () => { stop = true }
  }, [image])
  return <canvas ref={ref} class="thumb" width={80} height={128} style={{ width: height * 0.625, height }} aria-hidden="true" />
}
