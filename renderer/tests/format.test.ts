import { describe, expect, it } from 'vitest'
import { formatBytes, formatDuration } from '../src/utils/format'

describe('formatBytes', () => {
  it('formata mides', () => {
    expect(formatBytes(0)).toBe('0 B')
    expect(formatBytes(512)).toBe('512 B')
    expect(formatBytes(1536)).toBe('1.5 KB')
    expect(formatBytes(5 * 1024 * 1024)).toBe('5.0 MB')
  })
})

describe('formatDuration', () => {
  it('formata durades breus', () => {
    expect(formatDuration(0)).toBe('0 s')
    expect(formatDuration(40)).toBe('40 s')
    expect(formatDuration(60)).toBe('1 min')
    expect(formatDuration(200)).toBe('3 min 20 s')
    expect(formatDuration(3600)).toBe('1 h')
    expect(formatDuration(3900)).toBe('1 h 5 min')
    expect(formatDuration(-5)).toBe('0 s')
  })
})
