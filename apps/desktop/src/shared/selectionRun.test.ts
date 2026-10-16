import { describe, expect, it } from 'vitest'
import {
  hasEditorSelection,
  selectionRunBannerBody,
  selectionRunButtonLabel,
  selectionRunButtonTitle,
  selectionRunDoneToast,
} from './selectionRun'

describe('selectionRun', () => {
  it('switches run button into selection mode', () => {
    expect(hasEditorSelection(null)).toBe(false)
    expect(hasEditorSelection({ charCount: 12, lineCount: 1 })).toBe(true)
    expect(selectionRunButtonLabel(true, 5)).toBe('运行选区')
    expect(selectionRunButtonLabel(false, 5)).toBe('运行 5 条')
    expect(selectionRunButtonTitle(true, { charCount: 20, lineCount: 2 }, 5)).toContain('选区')
    expect(selectionRunButtonTitle(false, null, 5)).toContain('5')
  })

  it('formats banner and done toast', () => {
    expect(selectionRunBannerBody({ charCount: 8, lineCount: 1 })).toContain('8')
    expect(selectionRunDoneToast()).toContain('选中')
  })
})
