import { describe, expect, it } from 'vitest'
import {
  editorSelectionInfo,
  editorSelectionStatusLabel,
  editorSelectionStatusTitle,
} from './editorSelection'

describe('editorSelectionInfo', () => {
  it('returns null for empty text', () => {
    expect(editorSelectionInfo('', 1, 1)).toBeNull()
  })

  it('counts single-line selection', () => {
    expect(editorSelectionInfo('abc', 2, 2)).toEqual({ charCount: 3, lineCount: 1 })
  })

  it('counts multi-line and reverse ranges', () => {
    expect(editorSelectionInfo('a\nb\nc', 1, 3)).toEqual({ charCount: 5, lineCount: 3 })
    expect(editorSelectionInfo('xy', 5, 3)).toEqual({ charCount: 2, lineCount: 3 })
  })
})

describe('editorSelectionStatusLabel', () => {
  it('hides empty', () => {
    expect(editorSelectionStatusLabel(null)).toBeNull()
    expect(editorSelectionStatusLabel({ charCount: 0, lineCount: 1 })).toBeNull()
  })

  it('formats single and multi line', () => {
    expect(editorSelectionStatusLabel({ charCount: 12, lineCount: 1 })).toBe('已选 12 字符')
    expect(editorSelectionStatusLabel({ charCount: 48, lineCount: 3 })).toBe('已选 3 行 · 48 字符')
  })
})

describe('editorSelectionStatusTitle', () => {
  it('mentions run-selection behavior', () => {
    expect(editorSelectionStatusTitle()).toContain('选区')
  })
})
