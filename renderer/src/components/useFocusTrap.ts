import { useEffect, useRef } from 'preact/hooks'

const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'

/**
 * F6: atrapa el focus dins d'un contenidor (diàlegs/menús): enfoca el primer element en obrir, fa girar Tab/Shift+Tab i, en
 * tancar, retorna el focus a l'element que el tenia abans.
 */
export function useFocusTrap<T extends HTMLElement>(active = true) {
  const ref = useRef<T>(null)

  useEffect(() => {
    if (!active) return
    const container = ref.current
    if (container == null) return
    const previous = document.activeElement as HTMLElement | null
    const items = () => Array.from(container.querySelectorAll<HTMLElement>(FOCUSABLE))
    ;(items()[0] ?? container).focus()

    function onKeyDown(event: KeyboardEvent) {
      if (event.key !== 'Tab') return
      const list = items()
      if (list.length === 0) {
        event.preventDefault()
        return
      }
      const first = list[0]
      const last = list[list.length - 1]
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault()
        last.focus()
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault()
        first.focus()
      }
    }
    container.addEventListener('keydown', onKeyDown)
    return () => {
      container.removeEventListener('keydown', onKeyDown)
      previous?.focus?.()
    }
  }, [active])

  return ref
}
