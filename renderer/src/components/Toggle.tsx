export interface ToggleProps {
  checked: boolean
  onChange: (checked: boolean) => void
  disabled?: boolean
  label?: string
  /** Bloquejat per una dependència (només estil; `disabled` el fa inert). */
  blocked?: boolean
  title?: string
}

/** 08 §7: 40×22, accent quan activat. */
export function Toggle({ checked, onChange, disabled, label, blocked, title }: ToggleProps) {
  return (
    <label class={`toggle${blocked || disabled ? ' blocked' : ''}`} aria-label={label} title={title}>
      <input
        type="checkbox"
        checked={checked}
        disabled={disabled}
        onChange={(event) => onChange((event.target as HTMLInputElement).checked)}
      />
      <i />
    </label>
  )
}
