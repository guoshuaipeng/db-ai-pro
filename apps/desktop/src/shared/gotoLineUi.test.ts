import { describe, expect, it } from 'vitest'
import {
  estimateEditorLineCount,
  gotoLineEmptyTitle,
  gotoLinePreview,
} from './gotoLineUi'

describe('gotoLineUi', () => {
  it('estimates lines and previews clamp', () => {
    expect(estimateEditorLineCount('a\nb\nc')).toBe(3)
    expect(estimateEditorLineCount('')).toBe(1)
    expect(gotoLineEmptyTitle()).toContain('没有')
    const ok = gotoLinePreview({ line: 2, column: 1 }, 10)
    expect(ok.tone).toBe('ok')
    expect(ok.text).toContain('第 2 行')
    const clamp = gotoLinePreview({ line: 99, column: 1 }, 5)
    expect(clamp.tone).toBe('clamp')
    expect(clamp.text).toContain('第 5 行')
  })
})
