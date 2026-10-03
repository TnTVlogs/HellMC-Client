import type { ComponentChildren, JSX } from 'preact'
import type { LucideIcon } from 'lucide-preact'
import { useState } from 'preact/hooks'
import { gradientClass, initialOf } from '../identity'

/** Banner: la imatge si n'hi ha i carrega; si no (sense URL o URL trencada), el degradat de reserva del `seed`. */
export function Art({ seed, url, class: cls }: { seed: string; url?: string | null; class?: string }) {
  const [failed, setFailed] = useState<string | null>(null)
  if (url && failed !== url) {
    return (
      <div class={`art ${cls ?? ''}`}>
        <img src={url} alt="" onError={() => setFailed(url)} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }} />
      </div>
    )
  }
  return <div class={`art ${gradientClass(seed)} ${cls ?? ''}`} />
}

/** Icona quadrada (servidor o versió): la imatge si carrega; si no, la inicial sobre el degradat del `seed`. */
export function ServerIcon({ name, seed, url, class: cls }: { name: string; seed?: string; url?: string | null; class?: string }) {
  const [failed, setFailed] = useState<string | null>(null)
  if (url && failed !== url) {
    return <img class={`sicon img ${cls ?? ''}`} src={url} alt="" onError={() => setFailed(url)} aria-hidden="true" />
  }
  return (
    <div class={`sicon ${gradientClass(seed ?? name)} ${cls ?? ''}`} aria-hidden="true">
      {initialOf(name)}
    </div>
  )
}

export type ChipTone = 'accent' | 'ok' | 'warn' | 'info' | undefined

export function Chip({ tone, icon: Icon, children, ...rest }: { tone?: ChipTone; icon?: LucideIcon; children: ComponentChildren } & JSX.HTMLAttributes<HTMLSpanElement>) {
  return (
    <span class={`chip${tone ? ` ${tone}` : ''}`} {...rest}>
      {Icon != null && <Icon size={14} />}
      {children}
    </span>
  )
}

/** Barra de progrés (0..100). Sense valor = indeterminada. */
export function Progress({ value }: { value?: number | null }) {
  if (value == null) return <div class="progress indeterminate" role="progressbar"><i /></div>
  const v = Math.max(0, Math.min(100, value))
  return (
    <div class="progress" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(v)}>
      <i style={{ transform: `scaleX(${v / 100})` }} />
    </div>
  )
}

/** Progrés circular (tasques a la barra lateral). */
export function RingProgress({ value, size = 36 }: { value: number; size?: number }) {
  const v = Math.max(0, Math.min(100, value))
  return (
    <div class="ring-progress" role="progressbar" aria-valuenow={Math.round(v)} aria-valuemin={0} aria-valuemax={100}
      style={{ '--p': v, '--sz': `${size}px` } as JSX.CSSProperties}>
      <span>{Math.round(v)}</span>
    </div>
  )
}

export function StatusDot({ state }: { state: 'on' | 'off' | 'warn' | 'bad' }) {
  return <span class={`dot${state === 'on' ? '' : ` ${state}`}`} />
}

export function Banner({ tone = 'warn', icon: Icon, children, action }: { tone?: 'warn' | 'info'; icon?: LucideIcon; children: ComponentChildren; action?: ComponentChildren }) {
  return (
    <div class={`banner-msg${tone === 'info' ? ' info' : ''}`} role={tone === 'warn' ? 'alert' : 'status'}>
      {Icon != null && <Icon size={18} />}
      <span>{children}</span>
      {action != null && <><span style={{ flex: 1 }} />{action}</>}
    </div>
  )
}

export function Avatar({ name, seed }: { name: string; seed?: string }) {
  return <div class={`avatar ${gradientClass(seed ?? name)}`} aria-hidden="true">{initialOf(name)}</div>
}
