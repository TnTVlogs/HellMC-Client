import type { ComponentChildren } from 'preact'
import { useEffect, useLayoutEffect, useState } from 'preact/hooks'
import { useFocusTrap } from './useFocusTrap'

/**
 * Menú flotant ancorat a un element (compte, instàncies obertes…). Es dibuixa amb `position: fixed` per sobre de tot
 * —no dins la barra lateral, que talla el que sobresurt i feia aparèixer scroll horitzontal— i es tanca en clicar a
 * fora o amb Esc, com un diàleg. S'obre cap amunt (els disparadors són al peu de la barra).
 */
export function Popover({ anchor, onClose, width = 280, children }: {
  anchor: HTMLElement | null
  onClose: () => void
  width?: number
  children: ComponentChildren
}) {
  const [pos, setPos] = useState<{ left: number; bottom: number; maxHeight: number } | null>(null)
  const ref = useFocusTrap<HTMLDivElement>(pos != null)

  useLayoutEffect(() => {
    if (anchor == null) return
    const place = () => {
      const r = anchor.getBoundingClientRect()
      const margin = 8
      const w = Math.min(width, window.innerWidth - margin * 2)
      const left = Math.max(margin, Math.min(r.left, window.innerWidth - w - margin))
      setPos({ left, bottom: window.innerHeight - r.top + margin, maxHeight: Math.max(120, r.top - margin * 2) })
    }
    place()
    window.addEventListener('resize', place)
    return () => window.removeEventListener('resize', place)
  }, [anchor, width])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])

  return (
    <>
      <div class="popover-backdrop" onClick={onClose} aria-hidden="true" />
      {pos != null && (
        <div ref={ref} class="card popover-menu" role="menu" tabIndex={-1}
          style={{ left: pos.left, bottom: pos.bottom, maxHeight: pos.maxHeight, width: Math.min(width, window.innerWidth - 16) }}>
          {children}
        </div>
      )}
    </>
  )
}
