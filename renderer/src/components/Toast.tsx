import { useEffect, useRef } from 'preact/hooks'
import { AlertTriangle, CheckCircle2, Info, X, XCircle } from 'lucide-preact'
import { t } from '../i18n'
import { dismissToast, toasts, type ToastItem } from '../stores/toasts'

const ICONS = { info: Info, ok: CheckCircle2, warn: AlertTriangle, danger: XCircle } as const

/**
 * Una notificació. Es tanca sola passat `duration`, però el temps s'atura mentre el ratolí o el focus hi
 * són (WCAG 2.2.1: temps ajustable) i es pot tancar amb el botó o amb Esc quan té el focus.
 * `danger`/`warn` són `role="alert"` (assertiu); la resta `role="status"` (educat).
 */
export function ToastView({ toast }: { toast: ToastItem }) {
  const remaining = useRef(toast.duration)
  const startedAt = useRef(0)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const stop = () => {
    if (timer.current == null) return
    clearTimeout(timer.current)
    timer.current = null
    remaining.current = Math.max(500, remaining.current - (Date.now() - startedAt.current))
  }
  const start = () => {
    if (toast.duration <= 0 || timer.current != null) return
    startedAt.current = Date.now()
    timer.current = setTimeout(() => dismissToast(toast.id), remaining.current)
  }

  useEffect(() => {
    start()
    return () => { if (timer.current != null) clearTimeout(timer.current); timer.current = null }
  }, [])

  const Icon = ICONS[toast.tone]
  const urgent = toast.tone === 'danger' || toast.tone === 'warn'
  return (
    <div class={`toast ${toast.tone}`} role={urgent ? 'alert' : 'status'} aria-live={urgent ? 'assertive' : 'polite'}
      onMouseEnter={stop} onMouseLeave={start} onFocusCapture={stop} onBlurCapture={start}
      onKeyDown={(e) => { if (e.key === 'Escape') dismissToast(toast.id) }}>
      <Icon size={18} aria-hidden="true" />
      <span class="msg">{toast.message}</span>
      <button type="button" class="icon-btn sm" aria-label={t('ui.toastClose')} onClick={() => dismissToast(toast.id)}>
        <X size={16} />
      </button>
    </div>
  )
}

/** Contenidor únic (muntat a `Shell`): regió etiquetada a baix a la dreta. */
export function ToastHost() {
  const list = toasts.value
  return (
    <div class="toast-host" role="region" aria-label={t('ui.notifications')}>
      {list.map((x) => <ToastView key={x.id} toast={x} />)}
    </div>
  )
}
