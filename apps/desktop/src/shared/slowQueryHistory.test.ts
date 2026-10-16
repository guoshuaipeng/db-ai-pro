import { describe, expect, it } from 'vitest'
import { countSlowQueryHistory, filterSlowQueryHistory } from './slowQueryHistory'
import type { QueryHistoryEntry } from './types'

function entry(
  partial: Partial<QueryHistoryEntry> & Pick<QueryHistoryEntry, 'id' | 'elapsedMs'>,
): QueryHistoryEntry {
  return {
    connectionId: 'c1',
    sql: `select ${partial.id}`,
    ok: true,
    createdAt: '2026-10-16T00:00:00.000Z',
    ...partial,
  }
}

describe('slowQueryHistory', () => {
  const rows = [
    entry({ id: '1', elapsedMs: 2500 }),
    entry({ id: '2', elapsedMs: 100 }),
    entry({ id: '3', elapsedMs: 1000 }),
    entry({ id: '4', elapsedMs: undefined as unknown as number }),
  ]

  it('filters and caps slow rows', () => {
    expect(filterSlowQueryHistory(rows, 1000).map((r) => r.id)).toEqual(['1', '3'])
    expect(filterSlowQueryHistory(rows, 1000, 1).map((r) => r.id)).toEqual(['1'])
  })

  it('counts slow rows', () => {
    expect(countSlowQueryHistory(rows, 1000)).toBe(2)
    expect(countSlowQueryHistory(rows, 3000)).toBe(0)
  })
})
