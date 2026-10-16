import { describe, expect, it } from 'vitest'
import { cycleTabId } from './cycleTabs'

describe('cycleTabId', () => {
  it('returns null for empty', () => {
    expect(cycleTabId([], null, 1)).toBeNull()
  })

  it('cycles forward and backward', () => {
    const ids = ['a', 'b', 'c']
    expect(cycleTabId(ids, 'a', 1)).toBe('b')
    expect(cycleTabId(ids, 'c', 1)).toBe('a')
    expect(cycleTabId(ids, 'a', -1)).toBe('c')
    expect(cycleTabId(ids, 'b', -1)).toBe('a')
  })

  it('falls back when active missing', () => {
    expect(cycleTabId(['a', 'b'], 'missing', 1)).toBe('b')
  })
})
