import { describe, expect, it } from 'vitest'
import {
  applyColumnFilters,
  cellTextForColumnFilter,
  countActiveColumnFilters,
  isColumnFilterActive,
  matchColumnFilter,
  setColumnFilter,
} from './resultColumnFilter'

describe('resultColumnFilter', () => {
  const rows = [
    { id: 1, name: 'Alice', city: 'Shanghai', note: null },
    { id: 2, name: 'Bob', city: 'Beijing', note: 'vip' },
    { id: 3, name: '仓仓', city: '深圳', note: '' },
  ]

  it('detects active filters', () => {
    expect(isColumnFilterActive({ mode: 'contains', value: '  ' })).toBe(false)
    expect(isColumnFilterActive({ mode: 'contains', value: 'a' })).toBe(true)
    expect(isColumnFilterActive({ mode: 'empty', value: '' })).toBe(true)
  })

  it('matches contains / equals case-insensitively', () => {
    expect(matchColumnFilter('Shanghai', { mode: 'contains', value: 'SHANG' })).toBe(true)
    expect(matchColumnFilter('Shanghai', { mode: 'equals', value: 'shanghai' })).toBe(true)
    expect(matchColumnFilter('Shanghai', { mode: 'equals', value: 'Shang' })).toBe(false)
  })

  it('matches empty / notEmpty', () => {
    expect(matchColumnFilter(null, { mode: 'empty', value: '' })).toBe(true)
    expect(matchColumnFilter('', { mode: 'empty', value: '' })).toBe(true)
    expect(matchColumnFilter('x', { mode: 'empty', value: '' })).toBe(false)
    expect(matchColumnFilter('x', { mode: 'notEmpty', value: '' })).toBe(true)
  })

  it('ANDs column filters', () => {
    const filtered = applyColumnFilters(rows, {
      city: { mode: 'contains', value: 'ing' },
      name: { mode: 'contains', value: 'o' },
    })
    expect(filtered.map((r) => r.id)).toEqual([2])
  })

  it('stacks empty filter', () => {
    const filtered = applyColumnFilters(rows, {
      note: { mode: 'empty', value: '' },
    })
    expect(filtered.map((r) => r.id).sort()).toEqual([1, 3])
  })

  it('counts and clears via setColumnFilter', () => {
    const filters = {
      a: { mode: 'contains' as const, value: 'x' },
      b: { mode: 'contains' as const, value: '' },
    }
    expect(countActiveColumnFilters(filters)).toBe(1)
    const cleared = setColumnFilter(filters, 'a', null)
    expect(countActiveColumnFilters(cleared)).toBe(0)
    expect(cellTextForColumnFilter(null)).toBe('')
  })
})
