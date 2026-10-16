/** Filter / cap slow runs from query history (M33 threshold + M6 store). */

import { isSlowQuery } from './slowQuery'
import type { QueryHistoryEntry } from './types'

/** Max slow rows shown in the「仅慢查询」view. */
export const SLOW_QUERY_HISTORY_LIMIT = 50

/** Entries at/over threshold, newest first, capped. */
export function filterSlowQueryHistory(
  entries: readonly QueryHistoryEntry[],
  thresholdMs: number,
  limit = SLOW_QUERY_HISTORY_LIMIT,
): QueryHistoryEntry[] {
  const slow = entries.filter((row) => isSlowQuery(row.elapsedMs, thresholdMs))
  return slow.slice(0, Math.max(1, limit))
}

export function countSlowQueryHistory(
  entries: readonly QueryHistoryEntry[],
  thresholdMs: number,
): number {
  return entries.reduce(
    (sum, row) => sum + (isSlowQuery(row.elapsedMs, thresholdMs) ? 1 : 0),
    0,
  )
}
