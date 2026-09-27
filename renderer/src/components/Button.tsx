import type { JSX } from 'preact'

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger'
export type ButtonSize = 'sm' | 'md' | 'lg'

export interface ButtonProps extends Omit<JSX.ButtonHTMLAttributes<HTMLButtonElement>, 'size'> {
  variant?: ButtonVariant
  size?: ButtonSize
}

/** 08 §7: `primary`/`secondary`/`ghost`/`danger`, `sm 32`/`md 40`/`lg 52`. */
export function Button({ variant = 'primary', size = 'md', class: cls, type = 'button', ...rest }: ButtonProps) {
  const classes = ['btn', `btn-${variant}`, `btn-${size}`, cls].filter(Boolean).join(' ')
  return <button type={type} class={classes} {...rest} />
}
