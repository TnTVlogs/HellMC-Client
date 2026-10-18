import type { JSX } from 'preact'
import { Tooltip, type TooltipPlacement } from './Tooltip'

export interface IconButtonProps extends Omit<JSX.ButtonHTMLAttributes<HTMLButtonElement>, 'size' | 'label'> {
  /** Etiqueta accessible (`aria-label`) i text del tooltip (el contingut és només una icona). */
  label: string
  current?: boolean
  placement?: TooltipPlacement
}

/** 08 §7: quadrat 32 amb `Tooltip` propi (en lloc del `title` natiu). */
export function IconButton({ label, current, placement, class: cls, type = 'button', ...rest }: IconButtonProps) {
  const classes = ['icon-btn', current ? 'current' : '', cls].filter(Boolean).join(' ')
  return (
    <Tooltip content={label} placement={placement}>
      <button type={type} class={classes} aria-label={label} {...rest} />
    </Tooltip>
  )
}
