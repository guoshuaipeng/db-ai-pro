import { describe, expect, it } from 'vitest'
import { buildResultSummaryParts } from './resultSummary'

describe('buildResultSummaryParts', () => {
  it('shows returned / filtered / slow for grids', () => {
    const parts = buildResultSummaryParts({
      kind: 'grid',
      returnedRows: 100,
      shownRows: 12,
      selectedRows: 2,
      elapsedMs: 1500,
      slow: true,
      resultSetCount: 2,
    })
    expect(parts.map((p) => p.key)).toEqual([
      'returned',
      'shown',
      'selected',
      'sets',
      'elapsed',
      'slow',
    ])
    expect(parts.find((p) => p.key === 'shown')?.text).toContain('12')
  })

  it('shows affected rows for DML messages', () => {
    const parts = buildResultSummaryParts({
      kind: 'message',
      affectedRows: 3,
      elapsedMs: 40,
      slow: false,
    })
    expect(parts[0]).toMatchObject({ key: 'affected', text: '影响 3 行' })
    expect(parts.some((p) => p.key === 'slow')).toBe(false)
  })

  it('returns empty for empty kind', () => {
    expect(buildResultSummaryParts({ kind: 'empty' })).toEqual([])
  })
})
