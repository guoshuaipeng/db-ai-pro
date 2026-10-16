import { describe, expect, it } from 'vitest'
import {
  clampAiWidth,
  clampEditorRatio,
  clampSidebarWidth,
  LAYOUT,
  normalizeLayout,
} from './layoutBounds'

describe('layoutBounds', () => {
  it('clamps sidebar / ai / ratio for small screens', () => {
    expect(clampSidebarWidth(10)).toBe(LAYOUT.sidebarMin)
    expect(clampSidebarWidth(999)).toBe(LAYOUT.sidebarMax)
    expect(clampAiWidth(50)).toBe(LAYOUT.aiMin)
    expect(clampAiWidth(900)).toBe(LAYOUT.aiMax)
    expect(clampEditorRatio(0.1)).toBe(LAYOUT.editorRatioMin)
    expect(clampEditorRatio(9)).toBe(LAYOUT.editorRatioMax)
  })

  it('normalizes layout slice', () => {
    expect(normalizeLayout(null)).toEqual({
      sidebarWidth: LAYOUT.sidebarDefault,
      aiWidth: LAYOUT.aiDefault,
      editorRatio: LAYOUT.editorRatioDefault,
      sidebarOpen: true,
      aiOpen: false,
    })
    expect(normalizeLayout({ sidebarOpen: false, aiOpen: true, sidebarWidth: 300 }).sidebarOpen).toBe(
      false,
    )
  })
})
