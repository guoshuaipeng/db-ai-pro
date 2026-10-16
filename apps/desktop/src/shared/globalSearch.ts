import { fuzzyScore } from './commands'
import { favoritesForConnection } from './favorites'
import type { SchemaNode, SqlFavorite } from './types'

export const GLOBAL_SEARCH_LIMIT = 40

export type SchemaTableHit = {
  kind: 'schema-table'
  connectionId: string
  connectionName: string
  tableName: string
  score: number
}

export type SchemaColumnHit = {
  kind: 'schema-column'
  connectionId: string
  connectionName: string
  tableName: string
  columnName: string
  dataType?: string
  score: number
}

export type FavoriteHit = {
  kind: 'favorite'
  favorite: SqlFavorite
  score: number
}

export type GlobalSearchHit = SchemaTableHit | SchemaColumnHit | FavoriteHit

export type SchemaObjectIndex = {
  tables: Array<{ connectionId: string; connectionName: string; tableName: string }>
  columns: Array<{
    connectionId: string
    connectionName: string
    tableName: string
    columnName: string
    dataType?: string
  }>
}

/** Flatten tables/columns for one connection (or all if connectionId null). */
export function buildSchemaObjectIndex(
  schema: SchemaNode[],
  connectionId: string | null,
): SchemaObjectIndex {
  const tables: SchemaObjectIndex['tables'] = []
  const columns: SchemaObjectIndex['columns'] = []

  const visit = (node: SchemaNode, connName: string, connId: string, tableName: string | null) => {
    if (node.kind === 'connection') {
      const id = node.connectionId ?? node.id
      if (connectionId && id !== connectionId) return
      const name = node.displayName || node.name
      for (const child of node.children ?? []) visit(child, name, id, null)
      return
    }
    if (node.kind === 'database') {
      for (const child of node.children ?? []) visit(child, connName, connId, null)
      return
    }
    if (node.kind === 'table') {
      const tName = node.tableName || node.name
      tables.push({ connectionId: connId, connectionName: connName, tableName: tName })
      for (const child of node.children ?? []) visit(child, connName, connId, tName)
      return
    }
    if (node.kind === 'column' && tableName) {
      columns.push({
        connectionId: connId,
        connectionName: connName,
        tableName,
        columnName: node.name,
        dataType: node.dataType,
      })
    }
  }

  for (const root of schema) visit(root, root.displayName || root.name, root.connectionId ?? root.id, null)
  return { tables, columns }
}

export function searchGlobalObjects(
  query: string,
  index: SchemaObjectIndex,
  favorites: SqlFavorite[],
  options?: { connectionId?: string | null; limit?: number },
): GlobalSearchHit[] {
  const needle = query.trim()
  if (!needle) return []
  const limit = options?.limit ?? GLOBAL_SEARCH_LIMIT
  const connectionId = options?.connectionId ?? null
  const favs = favoritesForConnection(favorites, connectionId)

  const hits: GlobalSearchHit[] = []

  for (const row of index.tables) {
    const score = fuzzyScore(needle, row.tableName, row.connectionName, 'table 表')
    if (score === null) continue
    hits.push({ kind: 'schema-table', ...row, score: score + 80 })
  }
  for (const row of index.columns) {
    const score = fuzzyScore(needle, row.columnName, row.tableName, row.dataType ?? '', 'column 列')
    if (score === null) continue
    hits.push({ kind: 'schema-column', ...row, score: score + 40 })
  }
  for (const favorite of favs) {
    const score = fuzzyScore(needle, favorite.name, favorite.sql, 'favorite 收藏 片段')
    if (score === null) continue
    hits.push({ kind: 'favorite', favorite, score: score + 60 })
  }

  hits.sort((a, b) => b.score - a.score || a.kind.localeCompare(b.kind))
  return hits.slice(0, Math.max(1, limit))
}
