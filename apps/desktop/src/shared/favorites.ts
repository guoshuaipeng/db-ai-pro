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

/** Case-insensitive filter by name or SQL. Empty query → copy. */
export function filterFavorites(list: readonly SqlFavorite[], query: string): SqlFavorite[] {
  const q = query.trim().toLowerCase()
  if (!q) return list.slice()
  return list.filter((row) => {
    if (row.name.toLowerCase().includes(q)) return true
    if (row.sql.toLowerCase().includes(q)) return true
    return false
  })
}

export function favoriteSqlCopiedToast(): string {
  return '已复制片段 SQL 到剪贴板'
}

export function favoritesFilterEmptyBody(): string {
  return '没有匹配的收藏片段。试试名称或 SQL 关键字，或清除筛选。'
}

