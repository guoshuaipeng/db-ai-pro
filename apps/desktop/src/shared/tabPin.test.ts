import { describe, expect, it } from 'vitest'
import {
  closeOthersTargets,
  closeToRightTargets,
  isTabPinned,
  moveTabToIndex,
  sortPinnedFirst,
  togglePinnedFlag,
} from './tabPin'

describe('tabPin', () => {
  it('sorts pinned to the left stably', () => {
    const tabs = [
      { id: 'a', pinned: false },
      { id: 'b', pinned: true },
      { id: 'c' },
      { id: 'd', pinned: true },
    ]
    expect(sortPinnedFirst(tabs).map((t) => t.id)).toEqual(['b', 'd', 'a', 'c'])
  })

  it('togglePinnedFlag sets and clears', () => {
    const base = { id: '1', sql: 'x' }
    const pinned = togglePinnedFlag(base, true)
    expect(isTabPinned(pinned)).toBe(true)
    const cleared = togglePinnedFlag(pinned, false)
    expect(cleared.pinned).toBeUndefined()
  })

  it('close-others skips pinned', () => {
    const tabs = [
      { id: 'keep' },
      { id: 'p', pinned: true },
      { id: 'u' },
    ]
    expect(closeOthersTargets(tabs, 'keep').map((t) => t.id)).toEqual(['u'])
  })

  it('close-to-right skips pinned to the right', () => {
    const tabs = [
      { id: 'a' },
      { id: 'b' },
      { id: 'p', pinned: true },
      { id: 'c' },
    ]
    expect(closeToRightTargets(tabs, 'a').map((t) => t.id)).toEqual(['b', 'c'])
  })
})

  it('reorders within unpinned and clamps away from pins', () => {
    const tabs = [
      { id: 'p1', pinned: true },
      { id: 'p2', pinned: true },
      { id: 'a' },
      { id: 'b' },
      { id: 'c' },
    ]
    expect(moveTabToIndex(tabs, 'c', 2).map((t) => t.id)).toEqual(['p1', 'p2', 'c', 'a', 'b'])
    // trying to drop unpinned before pins clamps to start of unpinned
    expect(moveTabToIndex(tabs, 'c', 0).map((t) => t.id)).toEqual(['p1', 'p2', 'c', 'a', 'b'])
  })

  it('reorders within pinned group only', () => {
    const tabs = [
      { id: 'p1', pinned: true },
      { id: 'p2', pinned: true },
      { id: 'a' },
    ]
    expect(moveTabToIndex(tabs, 'p1', 2).map((t) => t.id)).toEqual(['p2', 'p1', 'a'])
    expect(moveTabToIndex(tabs, 'p1', 3).map((t) => t.id)).toEqual(['p2', 'p1', 'a'])
  })

