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
    <div class="tabs" role="tablist">
      {items.map((item) => (
        <button key={item.id} type="button" role="tab" aria-selected={item.id === active} onClick={() => onChange(item.id)}>
          {item.label}
        </button>
      ))}
    </div>
  )
}
