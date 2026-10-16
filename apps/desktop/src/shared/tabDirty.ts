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


export function dirtyKeepLabel(): string {
  return '继续编辑'
}

export function dirtyDiscardLabel(): string {
  return '丢弃更改'
}

export function dirtyMarkCleanLabel(): string {
  return '标记为已保存'
}

export function dirtyMarkCleanTitle(): string {
  return '接受当前 SQL 为干净基线，关闭标签时不再提示未保存'
}

export function dirtyBannerTitle(): string {
  return '有未保存的更改'
}

export function dirtyBannerBody(): string {
  return '此标签的 SQL 已相对上次干净状态修改。关闭或退出前会确认；也可标记为已保存以清除提示。'
}

export function dirtyCloseTabTitle(): string {
  return '关闭未保存的标签？'
}

export function dirtyCloseTabDetail(tabTitle: string): string {
  const name = tabTitle.trim() || '查询'
  return `「${name}」的 SQL 已修改，关闭后将丢弃这些更改。`
}

export function dirtyCloseWindowTitle(count: number): string {
  if (count <= 1) return '有未保存的查询标签'
  return `有 ${count} 个未保存的查询标签`
}

export function dirtyCloseWindowDetail(names: string, moreSuffix: string): string {
  return `以下标签的 SQL 已修改：${names}${moreSuffix}。关闭前请确认是否丢弃这些编辑。`
}

export function dirtyBatchCloseDetail(tabCount: number, dirtyNames: string, moreSuffix: string): string {
  return `将关闭 ${tabCount} 个标签，其中未保存：${dirtyNames}${moreSuffix}。丢弃后无法恢复这些编辑。`
}

export function dirtyTabCountLabel(count: number): string | null {
  if (count <= 0) return null
  return count === 1 ? '1 个未保存' : `${count} 个未保存`
}

export function dirtyMarkCleanToast(): string {
  return '已标记为已保存'
}
