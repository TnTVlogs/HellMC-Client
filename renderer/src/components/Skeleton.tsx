import type { ComponentChildren, JSX } from 'preact'

/**
 * Esquelet de càrrega (07 §2.4): bloc grisenc que polsa (`.skeleton`, components.css; sense animació amb
 * `prefers-reduced-motion` o mode rendiment). És decoratiu (`aria-hidden`): el contenidor que l'agrupa és qui
 * ha de portar `aria-busy` i un text accessible (vegeu `SkeletonGroup`).
 */
export function Skeleton({ width, height = 14, radius, class: cls, style }: {
  width?: number | string
  height?: number | string
  radius?: number | string
  class?: string
  style?: JSX.CSSProperties
}) {
  return <div class={`skeleton${cls ? ` ${cls}` : ''}`} aria-hidden="true" style={{ width, height, borderRadius: radius, ...style }} />
}

/** Línies de text d'amplades variades (l'última més curta). */
export function SkeletonText({ lines = 3, gap = 8 }: { lines?: number; gap?: number }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap }} aria-hidden="true">
      {Array.from({ length: lines }, (_, i) => <Skeleton key={i} width={i === lines - 1 && lines > 1 ? '60%' : '100%'} />)}
    </div>
  )
}

/**
 * Envolta esquelets: `aria-busy` + un `role="status"` amb el text de càrrega per als lectors de pantalla
 * (el text és visible només per a ells).
 */
export function SkeletonGroup({ label, children, class: cls, style }: { label: string; children: ComponentChildren; class?: string; style?: JSX.CSSProperties }) {
  return (
    <div class={cls} style={style} aria-busy="true">
      <span class="sr-only" role="status">{label}</span>
      {children}
    </div>
  )
}
