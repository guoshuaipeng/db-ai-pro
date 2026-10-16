import { describe, expect, it } from 'vitest'
import { resolveVisibleDatabases, whitelistForSave } from './dbVisibility'

describe('resolveVisibleDatabases', () => {
  const all = ['a', 'b', 'c']
  it('shows all when whitelist is nullish', () => {
    expect(resolveVisibleDatabases(all, null)).toEqual(all)
    expect(resolveVisibleDatabases(all, undefined)).toEqual(all)
  })
  it('shows none when whitelist empty', () => {
    expect(resolveVisibleDatabases(all, [])).toEqual([])
  })
  it('intersects preserving order', () => {
    expect(resolveVisibleDatabases(all, ['c', 'a', 'x'])).toEqual(['a', 'c'])
  })
})

describe('whitelistForSave', () => {
  it('stores null when all checked', () => {
    expect(whitelistForSave(['a', 'b'], ['b', 'a'])).toBeNull()
  })
  it('stores subset otherwise', () => {
    expect(whitelistForSave(['a', 'b', 'c'], ['c'])).toEqual(['c'])
  })
})