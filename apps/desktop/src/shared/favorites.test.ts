import { describe, expect, it } from 'vitest'
import { favoritesForConnection, upsertFavorite } from './favorites'
import type { SqlFavorite } from './types'

function fav(partial: Partial<SqlFavorite> & Pick<SqlFavorite, 'id' | 'name'>): SqlFavorite {
  return {
    sql: 'select 1',
    connectionId: null,
    createdAt: '2026-10-16T00:00:00.000Z',
    updatedAt: '2026-10-16T00:00:00.000Z',
    ...partial,
  }
}

describe('favorites helpers', () => {
  it('upserts by id and sorts by updatedAt', () => {
    const a = fav({ id: 'a', name: 'A', updatedAt: '2026-10-16T01:00:00.000Z' })
    const b = fav({ id: 'b', name: 'B', updatedAt: '2026-10-16T02:00:00.000Z' })
    const rows = upsertFavorite(upsertFavorite([], a), b)
    expect(rows.map((row) => row.id)).toEqual(['b', 'a'])
  })

  it('returns global + connection scoped favorites', () => {
    const rows = [
      fav({ id: 'g', name: 'global', connectionId: null }),
      fav({ id: 'c', name: 'conn', connectionId: 'c1' }),
      fav({ id: 'x', name: 'other', connectionId: 'c2' }),
    ]
    expect(favoritesForConnection(rows, 'c1').map((row) => row.id)).toEqual(['g', 'c'])
  })
})
