export interface TabItem {
  id: string
  label: string
}

export interface TabsProps {
  items: TabItem[]
  active: string
  onChange: (id: string) => void
}

/** 08 §7 (primer ús real, `VersionDetail`, 2.3): fila de botons, sense contingut propi — el pare
 * decideix què renderitzar per `active`. */
export function Tabs({ items, active, onChange }: TabsProps) {
  return (
    <div role="tablist" style={{ display: 'flex', gap: 'var(--space-1)', borderBottom: '1px solid var(--border)' }}>
      {items.map((item) => (
        <button
          key={item.id}
          type="button"
          role="tab"
          aria-selected={item.id === active}
          class="tab"
          data-active={item.id === active ? '' : undefined}
          onClick={() => onChange(item.id)}
        >
          {item.label}
        </button>
      ))}
    </div>
  )
}
