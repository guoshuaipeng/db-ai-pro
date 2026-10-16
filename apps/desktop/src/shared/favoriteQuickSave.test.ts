import { describe, expect, it } from 'vitest'
import { canSaveFavoriteSql, defaultFavoriteName } from './favoriteQuickSave'

describe('defaultFavoriteName', () => {
  it('uses meaningful tab title', () => {
    expect(defaultFavoriteName('周报查询', 'SELECT 1')).toBe('周报查询')
  })

  it('falls back to first SQL line for generic 查询 N', () => {
    expect(defaultFavoriteName('查询 3', '  -- note\nSELECT id FROM t')).toBe('SELECT id FROM t')
  })

  it('clips long SQL lines', () => {
    const long = `SELECT ${'x'.repeat(80)}`
    const name = defaultFavoriteName('', long)
    expect(name.length).toBeLessThanOrEqual(64)
    expect(name.endsWith('…')).toBe(true)
  })

  it('canSaveFavoriteSql', () => {
    expect(canSaveFavoriteSql('  ')).toBe(false)
    expect(canSaveFavoriteSql('SELECT 1')).toBe(true)
  })
})

