import { describe, expect, it } from 'vitest'
import {
  MAX_PINNED_RESULT_COLUMNS,
  clearPinnedColumns,
  pinColumnButtonTitle,
  pinnedColumnToast,
  togglePinnedColumns,
} from './resultColumnPin'

describe('resultColumnPin', () => {
  it('pins and unpins', () => {
    expect(togglePinnedColumns([], 'id')).toEqual({ next: ['id'], action: 'pin' })
    expect(togglePinnedColumns(['id'], 'id')).toEqual({ next: [], action: 'unpin' })
  })

  it('replaces oldest when at cap', () => {
    const result = togglePinnedColumns(['id', 'name'], 'city')
    expect(result.action).toBe('replace')
    expect(result.next).toEqual(['name', 'city'])
    expect(result.replaced).toBe('id')
    expect(MAX_PINNED_RESULT_COLUMNS).toBe(2)
  })

  it('toasts in Chinese', () => {
    expect(pinnedColumnToast('id', 'pin')).toContain('固定')
    expect(pinnedColumnToast('id', 'unpin')).toContain('取消')
    expect(pinnedColumnToast('city', 'replace', 'id')).toContain('替下')
    expect(pinColumnButtonTitle(false)).toContain('最多')
    expect(clearPinnedColumns()).toEqual([])
  })
})
