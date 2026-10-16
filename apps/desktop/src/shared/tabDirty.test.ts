import { describe, expect, it } from 'vitest'
import {
  dirtyBannerTitle,
  dirtyCloseTabDetail,
  dirtyMarkCleanLabel,
  dirtyTabCount,
  dirtyTabCountLabel,
  isTabDirty,
  tabTitleWithDirty,
  withCleanBaseline,
} from './tabDirty'

describe('tabDirty', () => {
  it('treats missing baseline as clean', () => {
    expect(isTabDirty({ sql: 'select 1' })).toBe(false)
  })

  it('detects edits against baseline', () => {
    const tab = withCleanBaseline({ id: '1', title: 'q', sql: 'select 1' })
    expect(isTabDirty(tab)).toBe(false)
    expect(isTabDirty({ ...tab, sql: 'select 2' })).toBe(true)
  })

  it('counts dirty tabs', () => {
    const a = withCleanBaseline({ sql: 'a' })
    const b = { ...withCleanBaseline({ sql: 'b' }), sql: 'b2' }
    expect(dirtyTabCount([a, b])).toBe(1)
  })

  it('prefixes dirty titles with a bullet', () => {
    expect(tabTitleWithDirty('客户', false)).toBe('客户')
    expect(tabTitleWithDirty('客户', true)).toBe('• 客户')
  })

  it('exposes unsaved UI copy', () => {
    expect(dirtyBannerTitle()).toContain('未保存')
    expect(dirtyCloseTabDetail('客户')).toContain('客户')
    expect(dirtyMarkCleanLabel()).toContain('已保存')
    expect(dirtyTabCountLabel(0)).toBeNull()
    expect(dirtyTabCountLabel(2)).toBe('2 个未保存')
  })
})
