export interface ToggleProps {
  checked: boolean
  onChange: (checked: boolean) => void
  disabled?: boolean
  label?: string
}

/** 08 §7: 40×22, accent quan activat. */
export function Toggle({ checked, onChange, disabled, label }: ToggleProps) {
  return (
    <label class="toggle" aria-label={label}>
      <input
        type="checkbox"
        checked={checked}
        disabled={disabled}
        onChange={(event) => onChange((event.target as HTMLInputElement).checked)}
      />
      <span class="toggle-track" />
      <span class="toggle-thumb" />
    </label>
  )
}
