import { describe, expect, it } from 'vitest'
import { formatBytes } from '../src/utils/format'

describe('formatBytes', () => {
  it('formata mides', () => {
    expect(formatBytes(0)).toBe('0 B')
    expect(formatBytes(512)).toBe('512 B')
    expect(formatBytes(1536)).toBe('1.5 KB')
    expect(formatBytes(5 * 1024 * 1024)).toBe('5.0 MB')
  })
})
