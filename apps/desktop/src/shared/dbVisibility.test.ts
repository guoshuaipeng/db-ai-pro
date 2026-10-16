import { describe, expect, it } from 'vitest'
import {
  dbVisibilityEmptyBody,
  filterDatabaseNames,
  invertDatabaseChecked,
  resolveVisibleDatabases,
  whitelistForSave,
} from './dbVisibility'

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

describe('filterDatabaseNames', () => {
  const all = ['orders', 'OrderArchive', 'users', 'sys']
  it('filters case-insensitively', () => {
    expect(filterDatabaseNames(all, 'order')).toEqual(['orders', 'OrderArchive'])
    expect(filterDatabaseNames(all, '  ')).toEqual(all)
  })
})

describe('invertDatabaseChecked', () => {
  it('toggles only the universe and preserves others', () => {
    const checked = new Set(['orders', 'sys'])
    const next = invertDatabaseChecked(['orders', 'users'], checked)
    expect([...next].sort()).toEqual(['sys', 'users'])
  })
})

describe('dbVisibilityEmptyBody', () => {
  it('returns Chinese guidance', () => {
    expect(dbVisibilityEmptyBody()).toContain('没有可显示的库')
  })
})

