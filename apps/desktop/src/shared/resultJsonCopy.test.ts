import { describe, expect, it } from 'vitest'
import {
  JSON_CLIPBOARD_ROW_CAP,
  buildResultJsonClipboard,
  resultJsonCopiedToast,
} from './resultJsonCopy'

describe('buildResultJsonClipboard', () => {
  it('builds pretty JSON', () => {
    const { text, rowCount, truncated } = buildResultJsonClipboard(
      ['id', 'name'],
      [{ id: 1, name: 'a' }],
    )
    expect(truncated).toBe(false)
    expect(rowCount).toBe(1)
    expect(text).toContain('"id": 1')
    expect(text).toContain('"name": "a"')
  })

  it('caps large row sets', () => {
    const rows = Array.from({ length: JSON_CLIPBOARD_ROW_CAP + 5 }, (_, i) => ({ id: i }))
    const { rowCount, truncated, total } = buildResultJsonClipboard(['id'], rows)
    expect(truncated).toBe(true)
    expect(rowCount).toBe(JSON_CLIPBOARD_ROW_CAP)
    expect(total).toBe(JSON_CLIPBOARD_ROW_CAP + 5)
  })
})

describe('resultJsonCopiedToast', () => {
  it('mentions truncate', () => {
    expect(resultJsonCopiedToast(3, false)).toContain('3')
    expect(resultJsonCopiedToast(2000, true)).toContain('截断')
  })
})
