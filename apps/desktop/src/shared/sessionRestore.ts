import type { EditorTabState } from './types'
import { normalizeBrowseState } from './tablePaging'

/** Max query tabs persisted / restored. */
export const SESSION_TAB_CAP = 20

export function normalizeSessionTab(raw: unknown): EditorTabState | null {
  if (!raw || typeof raw !== 'object') return null
  const row = raw as Partial<EditorTabState>
  if (typeof row.id !== 'string' || !row.id.trim()) return null
  if (typeof row.title !== 'string') return null
  if (typeof row.sql !== 'string') return null
  const connectionId =
    row.connectionId === undefined
      ? null
      : row.connectionId === null
        ? null
        : typeof row.connectionId === 'string'
          ? row.connectionId
          : null
  const browse = normalizeBrowseState(row.browse)
  return {
    id: row.id.trim(),
    title: row.title.trim() || '查询',
    sql: row.sql,
    connectionId,
    ...(browse ? { browse } : {}),
  }
}

export function normalizeSessionTabs(
  raw: unknown,
  cap = SESSION_TAB_CAP,
): EditorTabState[] {
  if (!Array.isArray(raw)) return []
  const out: EditorTabState[] = []
  const seen = new Set<string>()
  for (const item of raw) {
    const tab = normalizeSessionTab(item)
    if (!tab || seen.has(tab.id)) continue
    seen.add(tab.id)
    out.push(tab)
    if (out.length >= Math.max(1, cap)) break
  }
  return out
}

export function isTabDisconnected(
  tab: EditorTabState,
  connectionIds: Iterable<string>,
): boolean {
  if (!tab.connectionId) return false
  const set = connectionIds instanceof Set ? connectionIds : new Set(connectionIds)
  return !set.has(tab.connectionId)
}

export function pickActiveEditorId(
  tabs: EditorTabState[],
  preferred: string | null | undefined,
): string {
  if (preferred && tabs.some((tab) => tab.id === preferred)) return preferred
  return tabs[0]?.id ?? 'query-1'
}
