import type { FavoriteFolder, SqlFavorite } from './types'

export function upsertFavorite(list: SqlFavorite[], next: SqlFavorite): SqlFavorite[] {
  const without = list.filter((row) => row.id !== next.id)
  return [next, ...without].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
}

export function favoritesForConnection(list: SqlFavorite[], connectionId: string | null): SqlFavorite[] {
  return list.filter((row) => row.connectionId === null || row.connectionId === connectionId)
}

export function upsertFolder(list: FavoriteFolder[], next: FavoriteFolder): FavoriteFolder[] {
  const without = list.filter((row) => row.id !== next.id)
  return [...without, next].sort((a, b) => a.name.localeCompare(b.name, 'zh-CN'))
}

export function groupFavoritesByFolder(
  favorites: SqlFavorite[],
  folders: FavoriteFolder[],
): Array<{ folder: FavoriteFolder | null; items: SqlFavorite[] }> {
  const byFolder = new Map<string | null, SqlFavorite[]>()
  byFolder.set(null, [])
  for (const folder of folders) byFolder.set(folder.id, [])
  for (const fav of favorites) {
    const key = fav.folderId && byFolder.has(fav.folderId) ? fav.folderId : null
    byFolder.get(key)!.push(fav)
  }
  const groups: Array<{ folder: FavoriteFolder | null; items: SqlFavorite[] }> = [
    { folder: null, items: byFolder.get(null) ?? [] },
  ]
  for (const folder of folders) {
    groups.push({ folder, items: byFolder.get(folder.id) ?? [] })
  }
  return groups
}
