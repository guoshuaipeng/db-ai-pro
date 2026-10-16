import { describe, expect, it } from 'vitest'
import {
  buildResultSummaryParts,
  formatResultSummaryClipboard,
  resultGridEmptyBody,
  resultSummaryCopiedToast,
} from './resultSummary'

describe('buildResultSummaryParts', () => {
  it('shows returned / filtered / columns / slow for grids', () => {
    const parts = buildResultSummaryParts({
      kind: 'grid',
      returnedRows: 100,
      shownRows: 12,
      selectedRows: 2,
      columnCount: 5,
      elapsedMs: 1500,
      slow: true,
      resultSetCount: 2,
    })
    expect(parts.map((p) => p.key)).toEqual([
      'returned',
      'shown',
      'selected',
      'cols',
      'sets',
      'elapsed',
      'slow',
    ])
    expect(parts.find((p) => p.key === 'shown')?.text).toContain('12')
    expect(parts.find((p) => p.key === 'cols')?.text).toBe('5 列')
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

  it('formats clipboard and empty copy', () => {
    const parts = buildResultSummaryParts({
      kind: 'grid',
      returnedRows: 10,
      columnCount: 3,
      elapsedMs: 20,
    })
    expect(formatResultSummaryClipboard(parts)).toContain('返回 10 行')
    expect(formatResultSummaryClipboard(parts)).toContain('3 列')
    expect(resultSummaryCopiedToast(parts.length)).toBe('已复制结果摘要')
    expect(resultSummaryCopiedToast(0)).toContain('没有可复制')
    expect(resultGridEmptyBody()).toContain('COUNT')
  })
})
