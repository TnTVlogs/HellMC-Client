import { signal } from '@preact/signals'

// Cua de notificacions breus (`Toast`, 08 §7). Cap component hi escriu directament: sempre via
// `showToast`/`dismissToast`. El component `ToastHost` (components/Toast.tsx) les pinta.

export type ToastTone = 'info' | 'ok' | 'warn' | 'danger'

export interface ToastItem {
  id: number
  message: string
  tone: ToastTone
  /** ms abans de tancar-se sola; 0 = no es tanca fins que l'usuari ho fa. */
  duration: number
}

/** Màxim de notificacions visibles alhora: les més velles se'n van primer. */
export const MAX_TOASTS = 4

export const toasts = signal<ToastItem[]>([])

let nextId = 1

export function showToast(message: string, options: { tone?: ToastTone; duration?: number } = {}): number {
  const tone = options.tone ?? 'info'
  // Els errors i avisos es queden una mica més; la resta és un «fet» fugaç.
  const duration = options.duration ?? (tone === 'danger' || tone === 'warn' ? 7000 : 4000)
  const id = nextId++
  toasts.value = [...toasts.value, { id, message, tone, duration }].slice(-MAX_TOASTS)
  return id
}

export function dismissToast(id: number): void {
  toasts.value = toasts.value.filter((x) => x.id !== id)
}

export function clearToasts(): void {
  toasts.value = []
}
