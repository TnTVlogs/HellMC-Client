import { cloneElement, type VNode } from 'preact'
import { useEffect, useId, useRef, useState } from 'preact/hooks'

export type TooltipPlacement = 'top' | 'bottom' | 'left' | 'right'

/**
 * Tooltip accessible (08 §7): surt en passar el ratolí (amb petit retard) o en enfocar amb teclat, i es tanca amb Esc, en
 * sortir o en clicar. El fill rep `aria-describedby` mentre és visible; el text NO substitueix l'etiqueta accessible (el
 * fill ha de tenir el seu `aria-label`/text). Sense contingut no fa res. Posició `fixed` calculada amb el rectangle del
 * fill, sense cap dependència.
 */
export function Tooltip({ content, placement = 'top', delay = 450, children }: {
  content: string | null | undefined
  placement?: TooltipPlacement
  delay?: number
  children: VNode<Record<string, unknown>>
}) {
  const id = useId()
  const wrapRef = useRef<HTMLSpanElement>(null)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [pos, setPos] = useState<{ left: number; top: number; place: TooltipPlacement } | null>(null)
  const text = content ?? ''

  const hide = () => {
    if (timer.current != null) clearTimeout(timer.current)
    timer.current = null
    setPos(null)
  }
  const show = (immediate: boolean) => {
    if (text === '' || timer.current != null || pos != null) return
    const open = () => {
      timer.current = null
      const el = wrapRef.current?.firstElementChild
      if (el == null) return
      const r = el.getBoundingClientRect()
      const gap = 8
      const vw = window.innerWidth
      let place = placement
      // Si no hi cap a la banda demanada, es gira cap a l'altra.
      if (place === 'top' && r.top < 40) place = 'bottom'
      else if (place === 'bottom' && r.bottom > window.innerHeight - 40) place = 'top'
      else if (place === 'left' && r.left < 160) place = 'right'
      else if (place === 'right' && r.right > vw - 160) place = 'left'
      const cx = r.left + r.width / 2
      const cy = r.top + r.height / 2
      const spot = place === 'top' ? { left: cx, top: r.top - gap }
        : place === 'bottom' ? { left: cx, top: r.bottom + gap }
        : place === 'left' ? { left: r.left - gap, top: cy }
        : { left: r.right + gap, top: cy }
      setPos({ ...spot, left: Math.max(8, Math.min(spot.left, vw - 8)), place })
    }
    if (immediate || delay <= 0) open()
    else timer.current = setTimeout(open, delay)
  }

  useEffect(() => () => { if (timer.current != null) clearTimeout(timer.current) }, [])
  useEffect(() => {
    if (pos == null) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') hide() }
    document.addEventListener('keydown', onKey)
    window.addEventListener('scroll', hide, true)
    window.addEventListener('resize', hide)
    return () => {
      document.removeEventListener('keydown', onKey)
      window.removeEventListener('scroll', hide, true)
      window.removeEventListener('resize', hide)
    }
  }, [pos != null])

  const child = text !== '' && pos != null ? cloneElement(children, { 'aria-describedby': id }) : children
  return (
    <span ref={wrapRef} class="tip-wrap" onMouseEnter={() => show(false)} onMouseLeave={hide} onFocusCapture={() => show(true)} onBlurCapture={hide} onPointerDown={hide}>
      {child}
      {pos != null && (
        <span id={id} role="tooltip" class={`tooltip ${pos.place}`} style={{ left: pos.left, top: pos.top }}>{text}</span>
      )}
    </span>
  )
}
