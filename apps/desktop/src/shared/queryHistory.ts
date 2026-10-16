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
