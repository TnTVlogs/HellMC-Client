import en, { type Messages } from './en'
import es from './es'
import ca from './ca'
import { language, type Language } from '../stores/ui'

const messages: Record<Language, Messages> = { en, es, ca }

function resolvePath(obj: unknown, path: string[]): unknown {
  return path.reduce<unknown>((acc, segment) => (acc != null && typeof acc === 'object' ? (acc as Record<string, unknown>)[segment] : undefined), obj)
}

/** `t('common.hello')`, `t('common.distroSummary', { versions: 3, servers: 1 })`. */
export function t(key: string, params?: Record<string, string | number>): string {
  const raw = resolvePath(messages[language.value], key.split('.'))
  if (typeof raw !== 'string') {
    return key
  }
  if (params == null) {
    return raw
  }
  return raw.replace(/\{(\w+)\}/g, (match, name: string) => (name in params ? String(params[name]) : match))
}

export { language, setLanguage, type Language } from '../stores/ui'
