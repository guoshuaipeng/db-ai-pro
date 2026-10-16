/** Close / clear result tabs helpers (M103). */

export type ResultTabRef = { id: string }

export type ResultTabsState<T extends ResultTabRef> = {
  tabs: T[]
  activeId: string
}

/** Close one tab; returns null when none remain. */
export function closeResultTabState<T extends ResultTabRef>(
  state: ResultTabsState<T>,
  id: string,
): ResultTabsState<T> | null {
  const tabs = state.tabs.filter((tab) => tab.id !== id)
  if (tabs.length === 0) return null
  if (state.activeId !== id) return { tabs, activeId: state.activeId }
  const closedIndex = state.tabs.findIndex((tab) => tab.id === id)
  const nextIndex = Math.min(Math.max(closedIndex, 0), tabs.length - 1)
  return { tabs, activeId: tabs[nextIndex]!.id }
}

export function clearResultTabsToast(count: number): string {
  if (count <= 0) return '没有可清空的结果'
  return `已清空 ${count.toLocaleString('zh-CN')} 个结果标签`
}

export function closeResultTabToast(): string {
  return '已关闭结果标签'
}
