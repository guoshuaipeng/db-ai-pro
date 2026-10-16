import { describe, expect, it } from 'vitest'
import {
  editorFindButtonTitle,
  editorFindHasSelection,
  editorFindOpenedToast,
} from './editorFindFeedback'

describe('editorFindFeedback', () => {
  it('detects selection', () => {
    expect(editorFindHasSelection(null)).toBe(false)
    expect(editorFindHasSelection({ charCount: 0, lineCount: 1 })).toBe(false)
    expect(editorFindHasSelection({ charCount: 3, lineCount: 1 })).toBe(true)
  })

  it('builds button titles', () => {
    expect(editorFindButtonTitle('find', null)).toContain('Ctrl+F')
    expect(editorFindButtonTitle('find', { charCount: 4, lineCount: 1 })).toContain('选区')
    expect(editorFindButtonTitle('replace', { charCount: 10, lineCount: 3 })).toContain('选区内')
  })

  it('toasts only when selection exists', () => {
    expect(editorFindOpenedToast('find', null)).toBeNull()
    expect(editorFindOpenedToast('find', { charCount: 2, lineCount: 1 })).toContain('选区')
    expect(editorFindOpenedToast('replace', { charCount: 8, lineCount: 2 })).toContain('选区内')
  })
})
