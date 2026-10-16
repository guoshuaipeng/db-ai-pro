import { describe, expect, it } from 'vitest'
import {
  MARKDOWN_CLIPBOARD_ROW_CAP,
  buildResultMarkdownClipboard,
  resultMarkdownCopiedToast,
} from './resultMarkdownCopy'

describe('buildResultMarkdownClipboard', () => {
  it('builds a markdown table', () => {
    const { text, rowCount, truncated } = buildResultMarkdownClipboard(
      ['id', 'name'],
      [{ id: 1, name: 'a' }],
    )
    expect(truncated).toBe(false)
    expect(rowCount).toBe(1)
    expect(text).toContain('| id | name |')
    expect(text).toContain('| 1 | a |')
  })

  it('caps large row sets', () => {
    const rows = Array.from({ length: MARKDOWN_CLIPBOARD_ROW_CAP + 3 }, (_, i) => ({ id: i }))
    const { rowCount, truncated, total } = buildResultMarkdownClipboard(['id'], rows)
    expect(truncated).toBe(true)
    expect(rowCount).toBe(MARKDOWN_CLIPBOARD_ROW_CAP)
    expect(total).toBe(MARKDOWN_CLIPBOARD_ROW_CAP + 3)
  })
})

describe('resultMarkdownCopiedToast', () => {
  it('mentions truncate', () => {
    expect(resultMarkdownCopiedToast(10, false)).toContain('10')
    expect(resultMarkdownCopiedToast(2000, true)).toContain('截断')
  })
})
