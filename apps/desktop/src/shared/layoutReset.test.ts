import { describe, expect, it } from 'vitest'
import { LAYOUT } from './layoutBounds'
import {
  layoutResetDefaults,
  layoutResetToast,
  layoutSplitterAriaLabel,
} from './layoutReset'

describe('layoutReset', () => {
  it('toasts per target', () => {
    expect(layoutResetToast('sidebar')).toContain('连接栏')
    expect(layoutResetToast('editor')).toContain('编辑器')
    expect(layoutResetToast('ai')).toContain('助手')
    expect(layoutResetToast('all')).toContain('重置')
  })

  it('aria mentions double-click', () => {
    expect(layoutSplitterAriaLabel('调整连接栏宽度')).toContain('双击')
  })

  it('defaults match LAYOUT', () => {
    const d = layoutResetDefaults()
    expect(d.sidebarWidth).toBe(LAYOUT.sidebarDefault)
    expect(d.aiWidth).toBe(LAYOUT.aiDefault)
    expect(d.editorRatio).toBe(LAYOUT.editorRatioDefault)
  })
})
