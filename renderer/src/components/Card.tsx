import type { JSX } from 'preact'

export interface CardProps extends JSX.HTMLAttributes<HTMLDivElement> {
  /** Amb vora destacada en hover (targetes clicables). */
  interactive?: boolean
  /** Padding estàndard (`.card.pad`). */
  pad?: boolean
}

/** 08 §7: `surface-1`, radi 16, vora. */
export function Card({ interactive, pad, class: cls, ...rest }: CardProps) {
  const classes = ['card', pad ? 'pad' : '', cls].filter(Boolean).join(' ')
  return <div class={classes} style={interactive ? { cursor: 'pointer', ...(rest.style as object) } : rest.style} {...rest} />
}
