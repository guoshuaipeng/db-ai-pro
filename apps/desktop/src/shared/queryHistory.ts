import type { QueryHistoryEntry } from './types'

export const QUERY_HISTORY_LIMIT = 80

export function pushQueryHistory(
  existing: QueryHistoryEntry[],
  entry: QueryHistoryEntry,
  limit = QUERY_HISTORY_LIMIT,
): QueryHistoryEntry[] {
  const sql = entry.sql.trim()
  if (!sql) return existing.slice(0, limit)
  const next: QueryHistoryEntry = { ...entry, sql }
  const deduped = existing.filter((row) => !(row.sql === sql && row.ok === next.ok))
  return [next, ...deduped].slice(0, Math.max(1, limit))
}

export function historyPreview(sql: string, max = 96): string {
  const compact = sql.replace(/\s+/g, ' ').trim()
  if (compact.length <= max) return compact
  return `${compact.slice(0, max - 1)}…`
}

/** Case-insensitive filter by SQL (and error text). Empty query → copy of input. */
export function filterQueryHistory(
  entries: readonly QueryHistoryEntry[],
  query: string,
): QueryHistoryEntry[] {
  const q = query.trim().toLowerCase()
  if (!q) return entries.slice()
  return entries.filter((entry) => {
    if (entry.sql.toLowerCase().includes(q)) return true
    if (entry.error && entry.error.toLowerCase().includes(q)) return true
    return false
  })
}

export function historySqlCopiedToast(): string {
  return '已复制 SQL 到剪贴板'
}

export function historyFilterEmptyBody(slowOnly: boolean): string {
  if (slowOnly) return '没有同时匹配筛选关键字与慢查询条件的记录。可清除关键字或关闭「仅慢查询」。'
  return '没有匹配的历史记录。试试更短的关键字，或清除筛选。'
}

