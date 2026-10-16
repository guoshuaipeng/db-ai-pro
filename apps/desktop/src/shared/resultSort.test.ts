import { describe, expect, it } from 'vitest'
import { nextSortState, sortResultRows } from './resultSort'

describe('sortResultRows', () => {
  const rows = [
    { id: 3, name: 'c' },
    { id: 1, name: 'a' },
    { id: 2, name: 'b' },
    { id: null, name: 'z' },
  ]

  it('sorts numbers ascending with nulls last', () => {
    const out = sortResultRows(rows, { column: 'id', direction: 'asc' })
    expect(out.map((r) => r.id)).toEqual([1, 2, 3, null])
  })

  it('sorts descending', () => {
    const out = sortResultRows(rows, { column: 'name', direction: 'desc' })
    expect(out.map((r) => r.name)).toEqual(['z', 'c', 'b', 'a'])
  })

  it('returns original when sort cleared', () => {
    expect(sortResultRows(rows, null)).toBe(rows)
  })
})

describe('nextSortState', () => {
  it('cycles asc → desc → off', () => {
    expect(nextSortState(null, 'id')).toEqual({ column: 'id', direction: 'asc' })
    expect(nextSortState({ column: 'id', direction: 'asc' }, 'id')).toEqual({ column: 'id', direction: 'desc' })
    expect(nextSortState({ column: 'id', direction: 'desc' }, 'id')).toBeNull()
  })
})
