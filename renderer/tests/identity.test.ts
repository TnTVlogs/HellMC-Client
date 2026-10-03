import { describe, expect, it } from 'vitest'
import { GRADIENT_COUNT, gradientClass, gradientIndex, initialOf } from '../src/identity'

// Vectors compartits amb el panell (docs/panel-redesign §3.4): han de ser idèntics als dos repos.
const VECTORS: [string, number][] = [
  ['hellmc-survival', 1],
  ['hellmc-creatiu', 4],
  ['skyblock', 5],
  ['laboratori', 4],
  ['hellmc-forge-1.20.1', 7],
  ['testnom', 3],
  ['TESTID-26.3', 2],
  ['free', 5],
  ['a', 2],
  ['', 1],
]

describe('identity: color de reserva determinista', () => {
  it.each(VECTORS)('gradientIndex(%j) = %i', (seed, expected) => {
    expect(gradientIndex(seed)).toBe(expected)
    expect(gradientClass(seed)).toBe(`g${expected}`)
  })

  it('sempre dins 1..GRADIENT_COUNT i estable', () => {
    for (let i = 0; i < 500; i++) {
      const seed = `slug-${i}-${(i * 7919).toString(36)}`
      const idx = gradientIndex(seed)
      expect(idx).toBeGreaterThanOrEqual(1)
      expect(idx).toBeLessThanOrEqual(GRADIENT_COUNT)
      expect(gradientIndex(seed)).toBe(idx)
    }
  })

  it('repartiment raonable (cap color buit amb 800 slugs)', () => {
    const counts = new Array(GRADIENT_COUNT).fill(0)
    for (let i = 0; i < 800; i++) counts[gradientIndex(`server-${i}`) - 1]++
    expect(Math.min(...counts)).toBeGreaterThan(40)
  })

  it('initialOf', () => {
    expect(initialOf('HellMC Survival')).toBe('H')
    expect(initialOf('  àtic')).toBe('À')
    expect(initialOf('')).toBe('?')
  })
})
