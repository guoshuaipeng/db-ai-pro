import { describe, expect, it } from 'vitest'
import {
  filterResultRows,
  resultFilterActive,
  resultFilterClearedToast,
  resultFilterEmptyBody,
} from './resultFilter'

describe('filterResultRows', () => {
  const rows = [
    { id: 1, name: 'Alice', city: 'Shanghai' },
    { id: 2, name: 'Bob', city: 'Beijing' },
    { id: 3, name: '仓仓', city: '深圳' },
  ]

  it('returns all when query empty', () => {
    expect(filterResultRows(rows, '  ')).toHaveLength(3)
  })

  it('matches any column case-insensitively', () => {
    expect(filterResultRows(rows, 'bei').map((r) => r.id)).toEqual([2])
    expect(filterResultRows(rows, '仓').map((r) => r.id)).toEqual([3])
  })
})

describe('resultFilter empty / active helpers', () => {
  it('detects active filter and builds Chinese empty copy', () => {
    expect(resultFilterActive('  ')).toBe(false)
    expect(resultFilterActive('abc')).toBe(true)
    expect(resultFilterEmptyBody('Beijing')).toContain('Beijing')
    expect(resultFilterClearedToast()).toContain('清除')
  })
})

