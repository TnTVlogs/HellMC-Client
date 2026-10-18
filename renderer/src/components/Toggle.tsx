import { Tooltip } from './Tooltip'

export interface ToggleProps {
  checked: boolean
  onChange: (checked: boolean) => void
  disabled?: boolean
  label?: string
  /** Bloquejat per una dependència: estil i inert (sense animació ni canvi), amb tooltip com a explicació. */
  blocked?: boolean
  title?: string
}

/** 08 §7: 40×22, accent quan activat. */
export function Toggle({ checked, onChange, disabled, label, blocked, title }: ToggleProps) {
  return (
    <Tooltip content={title}>
      <label class={`toggle${blocked || disabled ? ' blocked' : ''}`} aria-label={label}>
        <input
          type="checkbox"
          checked={checked}
          disabled={disabled || blocked}
          onChange={(event) => onChange((event.target as HTMLInputElement).checked)}
        />
        <i />
      </label>
    </Tooltip>
  )
}
