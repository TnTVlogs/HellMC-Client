export interface TabItem {
  id: string
  label: string
}

export interface TabsProps {
  items: TabItem[]
  active: string
  onChange: (id: string) => void
}

/** 08 §7: fila de pestanyes (`.tabs`), el pare decideix què renderitzar per `active`. */
export function Tabs({ items, active, onChange }: TabsProps) {
  return (
    <div class="tabs" role="tablist" onKeyDown={(e) => {
      // F6: fletxes ←/→ (i Inici/Fi) canvien de pestanya, com a WAI-ARIA.
      const index = items.findIndex((item) => item.id === active)
      let next = index
      if (e.key === 'ArrowRight') next = (index + 1) % items.length
      else if (e.key === 'ArrowLeft') next = (index - 1 + items.length) % items.length
      else if (e.key === 'Home') next = 0
      else if (e.key === 'End') next = items.length - 1
      else return
      e.preventDefault()
      onChange(items[next].id)
      ;(e.currentTarget.querySelectorAll('[role="tab"]')[next] as HTMLElement | undefined)?.focus()
    }}>
      {items.map((item) => (
        <button key={item.id} type="button" role="tab" tabIndex={item.id === active ? 0 : -1} aria-selected={item.id === active} onClick={() => onChange(item.id)}>
          {item.label}
        </button>
      ))}
    </div>
  )
}
