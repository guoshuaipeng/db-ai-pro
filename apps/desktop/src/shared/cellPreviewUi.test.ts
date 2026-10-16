import { describe, expect, it } from 'vitest'
import { buildCellPreview } from './cellValuePreview'
import {
  cellPreviewClipboardText,
  cellPreviewLead,
  cellPreviewNullTitle,
  cellPreviewStats,
  countPreviewFindHits,
} from './cellPreviewUi'

describe('cellPreviewUi', () => {
  it('builds lead and stats', () => {
    const nullPreview = buildCellPreview(null)
    expect(cellPreviewLead(nullPreview)).toContain('NULL')
    expect(cellPreviewNullTitle()).toContain('NULL')
    expect(cellPreviewClipboardText(nullPreview)).toBe('NULL')
    expect(cellPreviewClipboardText(buildCellPreview(''))).toBe('')
    const stats = cellPreviewStats('a\nb\nc')
    expect(stats.lines).toBe(3)
    expect(stats.chars).toBe(5)
  })

  it('counts find hits case-insensitively', () => {
    expect(countPreviewFindHits('Foo bar foo', 'foo')).toBe(2)
    expect(countPreviewFindHits('abc', '')).toBe(0)
  })
})
