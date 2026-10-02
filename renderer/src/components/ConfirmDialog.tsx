import { useEffect } from 'preact/hooks'
import { Card } from './Card'
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

/** 08 §7 (primer ús real, 2.11): diàleg de confirmació, **al mig de la finestra** —
 * `position:fixed;inset:0` centra sobre tota la finestra (titlebar+barra lateral+contingut)
 * independentment d'on visqui al DOM, no calia un portal. Petició explícita de l'usuari: una acció
 * important no pot dependre d'un espai estret (la barra lateral, on vivia abans) que depenent de
 * l'idioma podria no tenir prou lloc pel text. */
export function ConfirmDialog({ title, message, confirmLabel, cancelLabel, danger = true, onConfirm, onCancel }: ConfirmDialogProps) {
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') onCancel()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [onCancel])

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0, 0, 0, .5)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 1000
      }}
      onClick={onCancel}
    >
      <Card
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="confirm-dialog-title"
        onClick={(e) => e.stopPropagation()}
        style={{ maxWidth: 420, width: '90%', display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}
      >
        <h2 id="confirm-dialog-title" style={{ margin: 0, fontSize: 'var(--fs-lg)', fontWeight: 600, color: 'var(--text)' }}>
          {title}
        </h2>
        <p style={{ margin: 0, color: 'var(--text-muted)' }}>{message}</p>
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 'var(--space-2)' }}>
          <Button variant="ghost" onClick={onCancel}>{cancelLabel}</Button>
          <Button variant={danger ? 'danger' : 'primary'} onClick={onConfirm}>{confirmLabel}</Button>
        </div>
      </Card>
    </div>
  )
}
