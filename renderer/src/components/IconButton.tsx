import type { JSX } from 'preact'

export type IconButtonSize = 'sm' | 'md'

export interface IconButtonProps extends Omit<JSX.ButtonHTMLAttributes<HTMLButtonElement>, 'size' | 'label'> {
  size?: IconButtonSize
  /** Fa doble de `title` (tooltip natiu de moment, 08 §7 preveu un `Tooltip` de veritat més
   * endavant) i `aria-label` (el contingut sol ser una icona sense text). */
  label: string
}

/** 08 §7: quadrat 32/40 amb tooltip. */
export function IconButton({ size = 'sm', label, class: cls, type = 'button', ...rest }: IconButtonProps) {
  const classes = ['icon-btn', size === 'md' ? 'icon-btn-md' : '', cls].filter(Boolean).join(' ')
  return <button type={type} class={classes} title={label} aria-label={label} {...rest} />
}
