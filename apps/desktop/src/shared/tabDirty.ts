import type { EditorTabState } from './types'

/** True when SQL differs from the last clean baseline (create / restore / browse). */
export function isTabDirty(tab: Pick<EditorTabState, 'sql' | 'baselineSql'>): boolean {
  if (tab.baselineSql === undefined) return false
  return tab.sql !== tab.baselineSql
}

/** Stamp current SQL as the clean baseline (in-memory only; not session-persisted). */
export function withCleanBaseline<T extends { sql: string }>(tab: T): T & { baselineSql: string } {
  return { ...tab, baselineSql: tab.sql }
}

export function dirtyTabCount(tabs: Pick<EditorTabState, 'sql' | 'baselineSql'>[]): number {
  return tabs.reduce((n, tab) => n + (isTabDirty(tab) ? 1 : 0), 0)
}

export function tabTitleWithDirty(title: string, dirty: boolean): string {
  const base = title.trim() || '查询'
  return dirty ? `• ${base}` : base
}
