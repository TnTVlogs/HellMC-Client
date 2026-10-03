import type { ComponentChildren, JSX } from 'preact'
import type { LucideIcon } from 'lucide-preact'

/** Degradats generats (P14: «degradat de color derivat del nom») — `g1`..`g5` del prototip. */
export function gradientClass(seed: string): string {
  let h = 0
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0
  return `g${(h % 5) + 1}`
}

/** Banner generat o imatge real si n'hi ha (`url`). */
export function Art({ seed, url, class: cls }: { seed: string; url?: string | null; class?: string }) {
  if (url) {
    return <div class={`art ${cls ?? ''}`} style={{ background: `center / cover url(${JSON.stringify(url)})` }} />
  }
  return <div class={`art ${gradientClass(seed)} ${cls ?? ''}`} />
}

/** Icona quadrada del servidor (inicial sobre degradat). */
export function ServerIcon({ name, seed, url, class: cls }: { name: string; seed?: string; url?: string | null; class?: string }) {
  const style = url ? { background: `center / cover url(${JSON.stringify(url)})` } : undefined
  return (
    <div class={`sicon ${url ? '' : gradientClass(seed ?? name)} ${cls ?? ''}`} style={style} aria-hidden="true">
      {url ? null : name.trim().charAt(0).toUpperCase()}
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
  const g = gradientClass(seed ?? name)
  const colors: Record<string, string> = {
    g1: 'linear-gradient(135deg,#b53a1b,#f28a3d)', g2: 'linear-gradient(135deg,#1f6fa8,#56c2e6)',
    g3: 'linear-gradient(135deg,#5b3fb0,#b07be8)', g4: 'linear-gradient(135deg,#1f8a52,#7ad99c)',
    g5: 'linear-gradient(135deg,#5a5f68,#a3a9b5)'
  }
  return <div class="avatar" style={{ background: colors[g] }} aria-hidden="true">{name.charAt(0).toUpperCase()}</div>
}
