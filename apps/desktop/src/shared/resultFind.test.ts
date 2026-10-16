import { describe, expect, it } from 'vitest'
import { collectResultFindHits, resultCellSearchText, stepFindIndex } from './resultFind'

describe('resultFind', () => {
  const columns = ['name', 'city']
  const rows = [
    { name: 'Alice', city: 'Shanghai' },
    { name: 'Bob', city: 'Beijing' },
    { name: 'alice', city: null },
  ]

  it('collects case-insensitive hits by default', () => {
    expect(collectResultFindHits(rows, columns, 'ali')).toEqual([
      { row: 0, col: 0 },
      { row: 2, col: 0 },
    ])
  })

  it('supports case-sensitive mode', () => {
    expect(collectResultFindHits(rows, columns, 'Alice', { caseSensitive: true })).toEqual([
      { row: 0, col: 0 },
    ])
  })

  it('returns empty for blank query', () => {
    expect(collectResultFindHits(rows, columns, '  ')).toEqual([])
  })

  it('wraps next/prev', () => {
    expect(stepFindIndex(0, 1, 3)).toBe(1)
    expect(stepFindIndex(2, 1, 3)).toBe(0)
    expect(stepFindIndex(0, -1, 3)).toBe(2)
    expect(stepFindIndex(0, 1, 0)).toBe(-1)
  })

  it('stringifies cell values', () => {
    expect(resultCellSearchText(null)).toBe('')
    expect(resultCellSearchText(12)).toBe('12')
  })
})
