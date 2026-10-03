import type { JSX } from 'preact'

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger'
export type ButtonSize = 'sm' | 'md' | 'lg'

export interface ButtonProps extends Omit<JSX.ButtonHTMLAttributes<HTMLButtonElement>, 'size'> {
  variant?: ButtonVariant
  size?: ButtonSize
  block?: boolean
}

/** 08 §7: `primary`/`secondary`/`ghost`/`danger`, `sm 32`/`md 40`/`lg 52` (classes del prototip). */
export function Button({ variant = 'secondary', size = 'md', block, class: cls, type = 'button', ...rest }: ButtonProps) {
  const classes = ['btn', variant === 'secondary' ? '' : variant, size === 'md' ? '' : size, block ? 'block' : '', cls]
    .filter(Boolean).join(' ')
  return <button type={type} class={classes} {...rest} />
}
