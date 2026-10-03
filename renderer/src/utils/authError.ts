import { t } from '../i18n'

/** Converteix l'error d'un login de Microsoft (`MS_ERROR:<CODI>` des del procés principal) en text
 * traduït; qualsevol altre missatge es mostra tal qual. */
export function authErrorMessage(err: unknown): string {
  const message = err instanceof Error ? err.message : String(err)
  const match = /MS_ERROR:([A-Z0-9_]+)/.exec(message)
  return match != null ? t(`auth.error.${match[1]}`) : message
}
