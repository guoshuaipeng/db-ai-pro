import type { EditorTabState } from './types'
import type { TableBrowseState } from './tablePaging'

/** Max closed tabs kept in memory (not session-persisted). */
export const CLOSED_TAB_STACK_CAP = 15

export type ClosedTabSnapshot = {
  title: string
  sql: string
  connectionId?: string | null
  pinned?: boolean
  browse?: TableBrowseState
}

export function snapshotClosedTab(tab: EditorTabState): ClosedTabSnapshot {
  return {
    title: tab.title,
    sql: tab.sql,
    connectionId: tab.connectionId ?? null,
    ...(tab.pinned ? { pinned: true } : {}),
    ...(tab.browse ? { browse: { ...tab.browse } } : {}),
  }
}

/** Push onto LIFO stack; drop oldest when over cap. */
export function pushClosedTab(
  stack: ClosedTabSnapshot[],
  snap: ClosedTabSnapshot,
  cap = CLOSED_TAB_STACK_CAP,
): ClosedTabSnapshot[] {
  const next = stack.concat([snap])
  const limit = Math.max(1, cap)
  return next.length > limit ? next.slice(next.length - limit) : next
}

export function popClosedTab(stack: ClosedTabSnapshot[]): {
  stack: ClosedTabSnapshot[]
  item: ClosedTabSnapshot | null
} {
  if (stack.length === 0) return { stack, item: null }
  const item = stack[stack.length - 1]!
  return { stack: stack.slice(0, -1), item }
}

export function peekClosedTab(stack: ClosedTabSnapshot[]): ClosedTabSnapshot | null {
  return stack.length ? stack[stack.length - 1]! : null
}
