import type { JSX } from 'preact'

export interface IconButtonProps extends Omit<JSX.ButtonHTMLAttributes<HTMLButtonElement>, 'size' | 'label'> {
  /** `title` + `aria-label` (el contingut és només una icona). */
  label: string
  current?: boolean
}

/** 08 §7: quadrat 32 amb tooltip. */
export function IconButton({ label, current, class: cls, type = 'button', ...rest }: IconButtonProps) {
  const classes = ['icon-btn', current ? 'current' : '', cls].filter(Boolean).join(' ')
  return <button type={type} class={classes} title={label} aria-label={label} {...rest} />
}
