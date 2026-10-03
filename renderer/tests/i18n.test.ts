import { describe, expect, it } from 'vitest'
import en from '../src/i18n/en'
import es from '../src/i18n/es'
import ca from '../src/i18n/ca'
import { t } from '../src/i18n'
import { setLanguage } from '../src/stores/ui'

function flatten(o: Record<string, unknown>, prefix = ''): string[] {
  return Object.entries(o).flatMap(([k, v]) =>
    v != null && typeof v === 'object' ? flatten(v as Record<string, unknown>, `${prefix}${k}.`) : [`${prefix}${k}`]
  )
}

function get(messages: unknown, key: string): unknown {
  return key.split('.').reduce<unknown>((acc, s) => (acc as Record<string, unknown>)[s], messages)
}

describe('i18n (06 §9)', () => {
  const keys = flatten(en as unknown as Record<string, unknown>).sort()

  it('es i ca tenen exactament les mateixes claus que en', () => {
    expect(flatten(es as unknown as Record<string, unknown>).sort()).toEqual(keys)
    expect(flatten(ca as unknown as Record<string, unknown>).sort()).toEqual(keys)
  })

  it('cap text és buit', () => {
    for (const [name, messages] of Object.entries({ en, es, ca })) {
      const empty = keys.filter((k) => {
        const v = get(messages, k)
        return typeof v === 'string' && v.trim() === ''
      })
      expect(empty, `${name}: ${empty.join(', ')}`).toEqual([])
    }
  })

  it('els paràmetres {x} coincideixen entre idiomes', () => {
    const params = (s: string) => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort()
    for (const key of keys) {
      expect(params(get(es, key) as string), key).toEqual(params(get(en, key) as string))
      expect(params(get(ca, key) as string), key).toEqual(params(get(en, key) as string))
    }
  })

  it('t() substitueix paràmetres, canvia amb l idioma i retorna la clau si no existeix', () => {
    setLanguage('en')
    expect(t('home.playingAs', { name: 'Steve' })).toBe('Playing as Steve')
    setLanguage('ca')
    expect(t('home.playingAs', { name: 'Steve' })).toContain('Steve')
    expect(t('clau.inexistent')).toBe('clau.inexistent')
  })
})
