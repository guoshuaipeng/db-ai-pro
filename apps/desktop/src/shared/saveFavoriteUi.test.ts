import { describe, expect, it } from 'vitest'
import {
  saveFavoriteEmptyTitle,
  saveFavoriteNameHint,
  saveFavoriteSqlPreview,
  saveFavoriteSqlStats,
} from './saveFavoriteUi'

describe('saveFavoriteUi', () => {
  it('builds empty copy, stats and preview', () => {
    expect(saveFavoriteEmptyTitle()).toContain('没有')
    expect(saveFavoriteNameHint('abc')).toBe('3/64')
    expect(saveFavoriteSqlStats('a\nb\n').lines).toBe(2)
    const preview = saveFavoriteSqlPreview('1\n2\n3\n4\n5\n6\n7\n8\n9\n10', 3)
    expect(preview).toContain('1')
    expect(preview).toContain('…')
  })
})
