import { describe, expect, it } from 'vitest'
import {
  toolbarMoreAria,
  toolbarMoreLabel,
  toolbarOverflowMenuBody,
  toolbarOverflowMenuTitle,
} from './toolbarOverflowUi'

describe('toolbarOverflowUi', () => {
  it('formats more button and menu copy', () => {
    expect(toolbarMoreLabel(0)).toBe('更多')
    expect(toolbarMoreLabel(4)).toBe('更多 · 4')
    expect(toolbarMoreAria(3, false)).toContain('3')
    expect(toolbarOverflowMenuTitle()).toContain('收起')
    expect(toolbarOverflowMenuBody(2)).toContain('2')
  })
})
