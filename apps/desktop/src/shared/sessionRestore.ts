import type { EditorTabState } from './types'
import { normalizeBrowseState } from './tablePaging'
import { sortPinnedFirst } from './tabPin'
import { sanitizeTabTitle } from './tabTitle'
import { INITIAL_TABS, SAMPLE_CONNECTION_ID } from './session'

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
  const databaseName =
    row.databaseName === undefined || row.databaseName === null
      ? null
      : typeof row.databaseName === 'string' && row.databaseName.trim()
        ? row.databaseName.trim()
        : null
  const browse = normalizeBrowseState(row.browse)
  const pinned = row.pinned === true
  const filePath =
    typeof row.filePath === 'string' && row.filePath.trim() ? row.filePath.trim() : null
  return {
    id: row.id.trim(),
    title: sanitizeTabTitle(row.title),
    sql: row.sql,
    connectionId,
    ...(databaseName ? { databaseName } : {}),
    ...(filePath ? { filePath } : {}),
    ...(browse ? { browse } : {}),
    ...(pinned ? { pinned: true } : {}),
  }
}

/** Exact seed demo SQL (title+sql) always belongs to sample-retail — never a server default DB. */
export function isSeedSampleTab(tab: Pick<EditorTabState, 'title' | 'sql'>): boolean {
  return INITIAL_TABS.some((seed) => seed.title === tab.title && seed.sql === tab.sql)
}

/**
 * Rebind unchanged seed demo tabs to the built-in sample connection.
 * Prevents cold-open runs against whatever activeConnection happened to be last used.
 */
export function healSeedSampleTabs(tabs: EditorTabState[]): EditorTabState[] {
  return tabs.map((tab) => {
    if (!isSeedSampleTab(tab)) return tab
    if (tab.connectionId === SAMPLE_CONNECTION_ID && !tab.databaseName) return tab
    const next: EditorTabState = { ...tab, connectionId: SAMPLE_CONNECTION_ID }
    if ('databaseName' in next) delete (next as { databaseName?: string | null }).databaseName
    return next
  })
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
  return sortPinnedFirst(out)
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
