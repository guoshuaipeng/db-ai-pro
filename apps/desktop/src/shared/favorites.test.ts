import { describe, expect, it } from 'vitest'
import {
  favoriteSqlCopiedToast,
  favoritesFilterEmptyBody,
  favoritesForConnection,
  filterFavorites,
  groupFavoritesByFolder,
  upsertFavorite,
  upsertFolder,
} from './favorites'
import type { FavoriteFolder, SqlFavorite } from './types'

function fav(partial: Partial<SqlFavorite> & Pick<SqlFavorite, 'id' | 'name'>): SqlFavorite {
  return {
    sql: 'SELECT 1',
    connectionId: null,
    folderId: null,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...partial,
  }
}

describe('favorites helpers', () => {
  it('upserts by id', () => {
    const a = fav({ id: 'a', name: 'A' })
    const b = fav({ id: 'b', name: 'B', updatedAt: '2026-02-01T00:00:00.000Z' })
    const rows = upsertFavorite(upsertFavorite([], a), b)
    expect(rows.map((row) => row.id)).toEqual(['b', 'a'])
  })

  it('returns global + connection scoped favorites', () => {
    const rows = [
      fav({ id: 'g', name: 'G', connectionId: null }),
      fav({ id: 'c', name: 'C', connectionId: 'c1' }),
      fav({ id: 'x', name: 'X', connectionId: 'c2' }),
    ]
    expect(favoritesForConnection(rows, 'c1').map((row) => row.id)).toEqual(['g', 'c'])
  })

  it('groups by folder', () => {
    const folders: FavoriteFolder[] = [
      { id: 'f1', name: '报表', createdAt: 't', updatedAt: 't' },
    ]
    const rows = [
      fav({ id: '1', name: 'a', folderId: 'f1' }),
      fav({ id: '2', name: 'b', folderId: null }),
      fav({ id: '3', name: 'c', folderId: 'missing' }),
    ]
    const groups = groupFavoritesByFolder(rows, folders)
    expect(groups[0].folder).toBeNull()
    expect(groups[0].items.map((i) => i.id).sort()).toEqual(['2', '3'])
    expect(groups[1].folder?.id).toBe('f1')
    expect(groups[1].items.map((i) => i.id)).toEqual(['1'])
  })

  it('upserts folders by name order', () => {
    const a = { id: '1', name: 'Z', createdAt: 't', updatedAt: 't' }
    const b = { id: '2', name: 'A', createdAt: 't', updatedAt: 't' }
    expect(upsertFolder(upsertFolder([], a), b).map((f) => f.name)).toEqual(['A', 'Z'])
  })
})

describe('filterFavorites', () => {
  it('matches name or sql case-insensitively', () => {
    const rows = [
      fav({ id: '1', name: '订单日报', sql: 'SELECT * FROM orders' }),
      fav({ id: '2', name: '用户', sql: 'select id from users' }),
    ]
    expect(filterFavorites(rows, 'order').map((r) => r.id)).toEqual(['1'])
    expect(filterFavorites(rows, '用户').map((r) => r.id)).toEqual(['2'])
    expect(filterFavorites(rows, '  ')).toHaveLength(2)
  })
})

describe('favorites copy strings', () => {
  it('returns Chinese guidance', () => {
    expect(favoriteSqlCopiedToast()).toContain('复制')
    expect(favoritesFilterEmptyBody()).toContain('匹配')
  })
})

