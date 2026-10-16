import type { SqlFavorite } from './types'

export function upsertFavorite(list: SqlFavorite[], next: SqlFavorite): SqlFavorite[] {
  const without = list.filter((row) => row.id !== next.id)
  return [next, ...without].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
}

export function favoritesForConnection(list: SqlFavorite[], connectionId: string | null): SqlFavorite[] {
  return list.filter((row) => row.connectionId === null || row.connectionId === connectionId)
}
