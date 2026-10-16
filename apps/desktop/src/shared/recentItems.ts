/** Recently opened tables & run/saved queries (lightweight). */

export const RECENT_ITEMS_LIMIT = 15

export type RecentTableItem = {
  kind: 'table'
  connectionId: string
  connectionName: string
  tableName: string
  at: string
}

export type RecentQueryItem = {
  kind: 'query'
  connectionId: string | null
  connectionName: string
  sql: string
  at: string
}

export type RecentItemsState = {
  version: 1
  tables: RecentTableItem[]
  queries: RecentQueryItem[]
}

export const EMPTY_RECENT: RecentItemsState = { version: 1, tables: [], queries: [] }

export function tableKey(connectionId: string, tableName: string): string {
  return `${connectionId}::${tableName}`
}

export function pushRecentTable(
  list: RecentTableItem[],
  item: Omit<RecentTableItem, 'kind' | 'at'> & { at?: string },
  limit = RECENT_ITEMS_LIMIT,
): RecentTableItem[] {
  const next: RecentTableItem = {
    kind: 'table',
    connectionId: item.connectionId,
    connectionName: item.connectionName,
    tableName: item.tableName,
    at: item.at ?? new Date().toISOString(),
  }
  const rest = list.filter(
    (row) => !(row.connectionId === next.connectionId && row.tableName === next.tableName),
  )
  return [next, ...rest].slice(0, Math.max(1, limit))
}

export function pushRecentQuery(
  list: RecentQueryItem[],
  item: Omit<RecentQueryItem, 'kind' | 'at'> & { at?: string },
  limit = RECENT_ITEMS_LIMIT,
): RecentQueryItem[] {
  const sql = item.sql.trim()
  if (!sql) return list.slice(0, limit)
  const next: RecentQueryItem = {
    kind: 'query',
    connectionId: item.connectionId,
    connectionName: item.connectionName,
    sql,
    at: item.at ?? new Date().toISOString(),
  }
  const rest = list.filter(
    (row) => !(row.sql === next.sql && row.connectionId === next.connectionId),
  )
  return [next, ...rest].slice(0, Math.max(1, limit))
}

export function normalizeRecentItems(raw: unknown): RecentItemsState {
  if (!raw || typeof raw !== 'object') return { ...EMPTY_RECENT }
  const obj = raw as Partial<RecentItemsState>
  const tables = Array.isArray(obj.tables)
    ? obj.tables
        .filter(
          (row): row is RecentTableItem =>
            Boolean(row) &&
            typeof row === 'object' &&
            typeof (row as RecentTableItem).connectionId === 'string' &&
            typeof (row as RecentTableItem).tableName === 'string',
        )
        .map((row) => ({
          kind: 'table' as const,
          connectionId: row.connectionId,
          connectionName: typeof row.connectionName === 'string' ? row.connectionName : '',
          tableName: row.tableName,
          at: typeof row.at === 'string' ? row.at : new Date(0).toISOString(),
        }))
        .slice(0, RECENT_ITEMS_LIMIT)
    : []
  const queries = Array.isArray(obj.queries)
    ? obj.queries
        .filter(
          (row): row is RecentQueryItem =>
            Boolean(row) &&
            typeof row === 'object' &&
            typeof (row as RecentQueryItem).sql === 'string' &&
            (row as RecentQueryItem).sql.trim().length > 0,
        )
        .map((row) => ({
          kind: 'query' as const,
          connectionId: typeof row.connectionId === 'string' ? row.connectionId : null,
          connectionName: typeof row.connectionName === 'string' ? row.connectionName : '',
          sql: row.sql.trim(),
          at: typeof row.at === 'string' ? row.at : new Date(0).toISOString(),
        }))
        .slice(0, RECENT_ITEMS_LIMIT)
    : []
  return { version: 1, tables, queries }
}

export function recentQueryTitle(sql: string, max = 72): string {
  const compact = sql.replace(/\s+/g, ' ').trim()
  if (compact.length <= max) return compact
  return `${compact.slice(0, max - 1)}…`
}

export function filterRecentTables(list: RecentTableItem[], query: string): RecentTableItem[] {
  const q = query.trim().toLowerCase()
  if (!q) return list
  return list.filter(
    (row) =>
      row.tableName.toLowerCase().includes(q) ||
      row.connectionName.toLowerCase().includes(q),
  )
}

export function filterRecentQueries(list: RecentQueryItem[], query: string): RecentQueryItem[] {
  const q = query.trim().toLowerCase()
  if (!q) return list
  return list.filter(
    (row) =>
      row.sql.toLowerCase().includes(q) ||
      row.connectionName.toLowerCase().includes(q),
  )
}


export type RecentKindFilter = 'all' | 'table' | 'query'

export const RECENT_KIND_FILTERS: readonly { id: RecentKindFilter; label: string }[] = [
  { id: 'all', label: '全部' },
  { id: 'table', label: '表' },
  { id: 'query', label: '查询' },
]

export function formatRecentTableClipboard(item: RecentTableItem): string {
  const table = item.tableName.trim()
  const conn = item.connectionName.trim()
  if (conn && table) return `${conn} / ${table}`
  return table || conn
}

export function formatRecentQueryClipboard(item: RecentQueryItem): string {
  return item.sql.trim()
}

export function recentTableCopiedToast(item: RecentTableItem): string {
  const name = item.tableName.trim() || '表'
  const clipped = name.length > 28 ? `${name.slice(0, 27)}…` : name
  return `已复制「${clipped}」`
}

export function recentQueryCopiedToast(): string {
  return '已复制 SQL 到剪贴板'
}

export function recentMenuEmptyBody(kind: RecentKindFilter, hasQuery: boolean): string {
  if (hasQuery && kind !== 'all') {
    return '没有匹配的最近项。试试更短的关键字，或切换到「全部」。'
  }
  if (hasQuery) return '没有匹配的最近表或查询。试试表名、连接名或 SQL 关键字。'
  if (kind === 'table') return '暂无最近表。在对象树打开表后会出现在这里。'
  if (kind === 'query') return '暂无最近查询。运行 SQL 后会出现在这里。'
  return '暂无最近项。打开表或运行 SQL 后会出现在这里。'
}

export function recentMenuMatchCount(tables: number, queries: number): string {
  return `${tables} 表 · ${queries} 查询`
}
