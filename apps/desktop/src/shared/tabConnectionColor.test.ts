import { describe, expect, it } from 'vitest'
import { resolveTabConnectionColor } from './tabConnectionColor'

describe('resolveTabConnectionColor', () => {
  const connections = [
    { id: 'c1', colorTag: 'blue' },
    { id: 'c2', colorTag: null },
    { id: 'c3' },
  ]

  it('returns palette color for tagged connection', () => {
    expect(resolveTabConnectionColor('c1', connections)).toBe('#6ea8fe')
  })

  it('returns null when unbound or untagged', () => {
    expect(resolveTabConnectionColor(null, connections)).toBeNull()
    expect(resolveTabConnectionColor('c2', connections)).toBeNull()
    expect(resolveTabConnectionColor('c3', connections)).toBeNull()
    expect(resolveTabConnectionColor('missing', connections)).toBeNull()
  })
})
