import type { JSX } from 'preact'

export interface CardProps extends JSX.HTMLAttributes<HTMLDivElement> {
  /** `surface-2` en hover + `translateY(-2px)` (desactivat en mode rendiment, 08 §7/§9). */
  interactive?: boolean
}

/** 08 §7: `surface-1`, radi 16, vora. */
export function Card({ interactive, class: cls, ...rest }: CardProps) {
  const classes = ['card', interactive ? 'card-interactive' : '', cls].filter(Boolean).join(' ')
  return <div class={classes} {...rest} />
}
