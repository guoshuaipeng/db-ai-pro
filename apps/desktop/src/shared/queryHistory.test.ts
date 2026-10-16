import { describe, expect, it } from 'vitest'
import { historyPreview, pushQueryHistory } from './queryHistory'
import type { QueryHistoryEntry } from './types'

function entry(partial: Partial<QueryHistoryEntry> & Pick<QueryHistoryEntry, 'id' | 'sql'>): QueryHistoryEntry {
  return {
    connectionId: 'c1',
    ok: true,
    createdAt: '2026-10-16T00:00:00.000Z',
    ...partial,
  }
}

describe('pushQueryHistory', () => {
  it('prepends and dedupes same sql+ok', () => {
    const first = entry({ id: '1', sql: 'select 1' })
    const second = entry({ id: '2', sql: 'select 2' })
    const again = entry({ id: '3', sql: 'select 1' })
    const rows = pushQueryHistory(pushQueryHistory([first], second), again)
    expect(rows.map((row) => row.id)).toEqual(['3', '2'])
  })

  it('keeps failed and success variants of the same sql', () => {
    const ok = entry({ id: '1', sql: 'select 1', ok: true })
    const bad = entry({ id: '2', sql: 'select 1', ok: false, error: 'boom' })
    const rows = pushQueryHistory([ok], bad)
    expect(rows).toHaveLength(2)
    expect(rows[0].ok).toBe(false)
  })

  it('respects limit', () => {
    let rows: QueryHistoryEntry[] = []
    for (let i = 0; i < 10; i += 1) {
      rows = pushQueryHistory(rows, entry({ id: String(i), sql: `select ${i}` }), 3)
    }
    expect(rows).toHaveLength(3)
    expect(rows[0].sql).toBe('select 9')
  })
})

describe('historyPreview', () => {
  it('collapses whitespace and truncates', () => {
    expect(historyPreview('select   *\nfrom t', 20)).toBe('select * from t')
    expect(historyPreview('x'.repeat(50), 10)).toBe(`${'x'.repeat(9)}…`)
  })
})
