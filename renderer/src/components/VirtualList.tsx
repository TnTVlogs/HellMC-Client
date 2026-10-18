import type { ComponentChildren } from 'preact'
import { useLayoutEffect, useRef, useState } from 'preact/hooks'

/** Per sota d'aquest nombre d'elements no es virtualitza (06 §10 / 08 §9: llistes > 100). */
export const VIRTUALIZE_THRESHOLD = 100

/** Interval d'índexs [start, end) a pintar. Pura, per poder-la provar sense DOM. */
export function visibleRange(opts: { count: number; rowHeight: number; offset: number; scrollTop: number; viewport: number; overscan: number }): [number, number] {
  const { count, rowHeight, offset, scrollTop, viewport, overscan } = opts
  const first = Math.floor((scrollTop - offset) / rowHeight) - overscan
  const last = Math.ceil((scrollTop - offset + viewport) / rowHeight) + overscan
  return [Math.max(0, Math.min(count, first)), Math.max(0, Math.min(count, last))]
}

function scrollParent(el: HTMLElement | null): HTMLElement | Window {
  for (let p = el?.parentElement ?? null; p != null; p = p.parentElement) {
    const o = getComputedStyle(p).overflowY
    if (o === 'auto' || o === 'scroll') return p
  }
  return window
}

/**
 * Llista virtualitzada d'alçada de fila fixa, sense dependències: només pinta les files visibles (+ `overscan`) dins
 * del contenidor amb scroll més proper (o la finestra). Per sota de `VIRTUALIZE_THRESHOLD` elements pinta tot (sense
 * cap diferència visible ni d'accessibilitat). Les files han de tenir exactament `rowHeight` px d'alçada; amb
 * virtualització activa cada fila porta `aria-posinset`/`aria-setsize` perquè els lectors de pantalla sàpiguen la
 * posició real dins la llista completa.
 */
export function VirtualList<T>({ items, rowHeight, getKey, renderItem, overscan = 6, threshold = VIRTUALIZE_THRESHOLD, class: cls, role = 'list', gap = 0 }: {
  items: T[]
  rowHeight: number
  getKey: (item: T) => string
  renderItem: (item: T, index: number, a11y: { 'aria-posinset': number; 'aria-setsize': number } | Record<string, never>) => ComponentChildren
  overscan?: number
  threshold?: number
  class?: string
  role?: 'list' | 'listbox'
  /** Espai entre files, inclòs en l'alçada de pas (`rowHeight + gap`). */
  gap?: number
}) {
  const ref = useRef<HTMLDivElement>(null)
  const virtual = items.length > threshold
  const step = rowHeight + gap
  const [win, setWin] = useState<[number, number]>([0, Math.min(items.length, 40)])

  useLayoutEffect(() => {
    if (!virtual) return
    const el = ref.current
    if (el == null) return
    const scroller = scrollParent(el)
    const compute = () => {
      const isWin = scroller === window
      const top = el.getBoundingClientRect().top
      const viewTop = isWin ? 0 : (scroller as HTMLElement).getBoundingClientRect().top
      const viewport = isWin ? window.innerHeight : (scroller as HTMLElement).clientHeight || window.innerHeight
      // `offset` = on comença la llista dins del contingut desplaçable; `scrollTop` el compensem amb la posició relativa.
      const hidden = viewTop - top // píxels de la llista ja per sobre de la vora superior visible
      const next = visibleRange({ count: items.length, rowHeight: step, offset: 0, scrollTop: hidden, viewport, overscan })
      setWin((cur) => (cur[0] === next[0] && cur[1] === next[1] ? cur : next))
    }
    compute()
    scroller.addEventListener('scroll', compute, { passive: true })
    window.addEventListener('resize', compute)
    return () => {
      scroller.removeEventListener('scroll', compute)
      window.removeEventListener('resize', compute)
    }
  }, [virtual, items.length, step, overscan])

  if (!virtual) {
    return <div class={cls} role={role} style={gap > 0 ? { display: 'flex', flexDirection: 'column', gap } : undefined}>{items.map((it, i) => renderItem(it, i, {}))}</div>
  }
  const [start, end] = win
  return (
    <div ref={ref} class={cls} role={role} style={{ position: 'relative', height: items.length * step - gap }}>
      {items.slice(start, end).map((it, k) => {
        const i = start + k
        return (
          <div key={getKey(it)} style={{ position: 'absolute', left: 0, right: 0, top: i * step, height: rowHeight }}>
            {renderItem(it, i, { 'aria-posinset': i + 1, 'aria-setsize': items.length })}
          </div>
        )
      })}
    </div>
  )
}
