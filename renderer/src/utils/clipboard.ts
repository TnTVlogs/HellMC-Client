import { t } from '../i18n'
import { showToast } from '../stores/toasts'

/** Copia text al porta-retalls i ho confirma amb un toast (o avisa si no s'ha pogut). Retorna si ha anat bé. */
export async function copyWithToast(text: string, okMessage?: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text)
    showToast(okMessage ?? t('ui.copied'), { tone: 'ok' })
    return true
  } catch {
    showToast(t('ui.copyFailed'), { tone: 'danger' })
    return false
  }
}
