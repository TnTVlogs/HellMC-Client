import { useEffect } from 'preact/hooks'
import { Button } from './Button'

export interface ConfirmDialogProps {
  title: string
  message: string
  confirmLabel: string
  cancelLabel: string
  danger?: boolean
  onConfirm: () => void
  onCancel: () => void
}

/** 08 §7 (`.dialog`): diàleg de confirmació **al mig de la finestra** (`position:fixed;inset:0`),
 * independentment d'on visqui al DOM. `Esc` cancel·la; acció destructiva en color de perill. */
export function ConfirmDialog({ title, message, confirmLabel, cancelLabel, danger = true, onConfirm, onCancel }: ConfirmDialogProps) {
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') onCancel()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [onCancel])

  return (
    <div class="dialog-host" onClick={onCancel}>
      <div class="card dialog" role="alertdialog" aria-modal="true" aria-labelledby="confirm-dialog-title" onClick={(e) => e.stopPropagation()}>
        <h2 id="confirm-dialog-title">{title}</h2>
        <p class="muted">{message}</p>
        <div class="actions">
          <Button variant="ghost" onClick={onCancel}>{cancelLabel}</Button>
          <Button variant={danger ? 'danger' : 'primary'} onClick={onConfirm}>{confirmLabel}</Button>
        </div>
      </div>
    </div>
  )
}
