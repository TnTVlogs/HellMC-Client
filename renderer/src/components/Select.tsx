import type { JSX } from 'preact'
import { useEffect, useId, useLayoutEffect, useRef, useState } from 'preact/hooks'
import { Check, ChevronDown } from 'lucide-preact'

export interface SelectOption {
  value: string
  label: string
  disabled?: boolean
}

/**
 * Selector propi (08 §7), patró WAI-ARIA «select-only combobox»: el focus es queda al botó, la llista és un `listbox`
 * i l'opció activa s'indica amb `aria-activedescendant`. Teclat: fletxes, Home/End, Re Pàg/Av Pàg, Enter/Espai (tria),
 * Esc (tanca sense canviar), Tab (tanca) i cerca per lletres. La llista és `fixed` (no la talla cap `overflow`) i
 * s'obre cap amunt si a sota no hi cap. El `<label for=id>` de fora funciona perquè l'`id` és al botó.
 */
export function Select({ value, options, onChange, id, ariaLabel, disabled, size, class: cls, style, placeholder }: {
  value: string
  options: SelectOption[]
  onChange: (value: string) => void
  id?: string
  ariaLabel?: string
  disabled?: boolean
  size?: 'sm'
  class?: string
  style?: JSX.CSSProperties
  placeholder?: string
}) {
  const autoId = useId()
  const listId = `${autoId}-list`
  const optId = (i: number) => `${autoId}-o${i}`
  const btnRef = useRef<HTMLButtonElement>(null)
  const listRef = useRef<HTMLDivElement>(null)
  const typed = useRef({ text: '', at: 0 })
  const [open, setOpen] = useState(false)
  const [active, setActive] = useState(0)
  const [rect, setRect] = useState<{ left: number; width: number; top?: number; bottom?: number; maxHeight: number } | null>(null)

  const selectedIndex = options.findIndex((o) => o.value === value)
  const selected = selectedIndex >= 0 ? options[selectedIndex] : null
  const enabled = (i: number) => options[i] != null && options[i].disabled !== true

  function step(from: number, dir: 1 | -1): number {
    for (let i = from + dir; i >= 0 && i < options.length; i += dir) if (enabled(i)) return i
    return from
  }
  function edge(dir: 1 | -1): number {
    const start = dir === 1 ? -1 : options.length
    return step(start, dir)
  }

  function openList() {
    if (disabled === true || options.length === 0) return
    setActive(selectedIndex >= 0 && enabled(selectedIndex) ? selectedIndex : edge(1))
    setOpen(true)
  }
  function close() { setOpen(false) }
  function choose(i: number) {
    if (!enabled(i)) return
    setOpen(false)
    if (options[i].value !== value) onChange(options[i].value)
    btnRef.current?.focus()
  }

  useLayoutEffect(() => {
    if (!open) return
    const place = () => {
      const r = btnRef.current?.getBoundingClientRect()
      if (r == null) return
      const margin = 8
      const below = window.innerHeight - r.bottom - margin
      const above = r.top - margin
      const wanted = Math.min(280, options.length * 36 + 8)
      if (below >= Math.min(wanted, 160) || below >= above) setRect({ left: r.left, width: r.width, top: r.bottom + 4, maxHeight: Math.max(96, below - 4) })
      else setRect({ left: r.left, width: r.width, bottom: window.innerHeight - r.top + 4, maxHeight: Math.max(96, above - 4) })
    }
    place()
    window.addEventListener('resize', place)
    return () => window.removeEventListener('resize', place)
  }, [open, options.length])

  // Tancar en clicar a fora o en fer scroll fora de la llista.
  useEffect(() => {
    if (!open) return
    const onDown = (e: Event) => {
      const target = e.target as Node
      if (btnRef.current?.contains(target) || listRef.current?.contains(target)) return
      setOpen(false)
    }
    const onScroll = (e: Event) => { if (!listRef.current?.contains(e.target as Node)) setOpen(false) }
    document.addEventListener('pointerdown', onDown, true)
    window.addEventListener('scroll', onScroll, true)
    return () => {
      document.removeEventListener('pointerdown', onDown, true)
      window.removeEventListener('scroll', onScroll, true)
    }
  }, [open])

  // L'opció activa sempre és visible.
  useEffect(() => {
    if (open) document.getElementById(optId(active))?.scrollIntoView?.({ block: 'nearest' })
  }, [open, active, rect != null])

  function typeahead(key: string): number | null {
    const now = Date.now()
    const t = typed.current
    t.text = now - t.at > 700 ? key : t.text + key
    t.at = now
    const needle = t.text.toLowerCase()
    // Una sola lletra repetida recorre les coincidències; si no, prefix de tot el que s'ha escrit.
    const cycle = needle.length > 1 && [...needle].every((c) => c === needle[0])
    const probe = cycle ? needle[0] : needle
    const from = open ? active : selectedIndex
    for (let n = 1; n <= options.length; n++) {
      const i = (from + n + options.length) % options.length
      if (enabled(i) && options[i].label.toLowerCase().startsWith(probe)) return i
    }
    return null
  }

  function onKeyDown(e: KeyboardEvent) {
    if (disabled === true) return
    const k = e.key
    if (!open) {
      if (k === 'ArrowDown' || k === 'ArrowUp' || k === 'Enter' || k === ' ') { e.preventDefault(); openList(); return }
      if (k === 'Home' || k === 'End') {
        e.preventDefault()
        const i = edge(k === 'Home' ? 1 : -1)
        if (enabled(i) && options[i].value !== value) onChange(options[i].value)
        return
      }
      if (k.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) {
        const i = typeahead(k)
        if (i != null && options[i].value !== value) onChange(options[i].value)
      }
      return
    }
    switch (k) {
      case 'ArrowDown': e.preventDefault(); setActive(step(active, 1)); break
      case 'ArrowUp': e.preventDefault(); setActive(step(active, -1)); break
      case 'Home': e.preventDefault(); setActive(edge(1)); break
      case 'End': e.preventDefault(); setActive(edge(-1)); break
      case 'PageDown': e.preventDefault(); { let i = active; for (let n = 0; n < 8; n++) i = step(i, 1); setActive(i) } break
      case 'PageUp': e.preventDefault(); { let i = active; for (let n = 0; n < 8; n++) i = step(i, -1); setActive(i) } break
      case 'Enter':
      case ' ': e.preventDefault(); choose(active); break
      case 'Escape': e.preventDefault(); e.stopPropagation(); close(); break
      case 'Tab': close(); break
      default:
        if (k.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) {
          const i = typeahead(k)
          if (i != null) setActive(i)
        }
    }
  }

  return (
    <>
      <button ref={btnRef} id={id} type="button" role="combobox" class={`field select-btn${size === 'sm' ? ' sm' : ''}${cls ? ` ${cls}` : ''}`} style={style}
        aria-haspopup="listbox" aria-expanded={open} aria-controls={open ? listId : undefined} aria-label={ariaLabel}
        aria-activedescendant={open ? optId(active) : undefined} disabled={disabled}
        onClick={() => (open ? close() : openList())} onKeyDown={onKeyDown} onBlur={() => { if (open && document.activeElement !== btnRef.current) close() }}>
        <span class="select-value">{selected?.label ?? placeholder ?? ''}</span>
        <ChevronDown size={16} aria-hidden="true" />
      </button>
      {open && rect != null && (
        <div ref={listRef} id={listId} role="listbox" aria-label={ariaLabel} class="select-list"
          style={{ left: rect.left, width: rect.width, top: rect.top, bottom: rect.bottom, maxHeight: rect.maxHeight }}
          onMouseDown={(e) => e.preventDefault()}>
          {options.map((o, i) => (
            <div key={o.value} id={optId(i)} role="option" aria-selected={o.value === value} aria-disabled={o.disabled === true ? true : undefined}
              class={`select-opt${i === active ? ' active' : ''}${o.value === value ? ' selected' : ''}`}
              onMouseMove={() => { if (enabled(i) && active !== i) setActive(i) }} onClick={() => choose(i)}>
              <span class="select-opt-label">{o.label}</span>
              {o.value === value && <Check size={14} aria-hidden="true" />}
            </div>
          ))}
        </div>
      )}
    </>
  )
}
