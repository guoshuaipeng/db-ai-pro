/** Close / clear result tabs helpers (M103 / M106). */

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

/** Keep only the given tab. */
export function closeOtherResultTabsState<T extends ResultTabRef>(
  state: ResultTabsState<T>,
  keepId: string,
): ResultTabsState<T> | null {
  const keep = state.tabs.find((tab) => tab.id === keepId)
  if (!keep) return state.tabs.length ? state : null
  if (state.tabs.length <= 1) return state
  return { tabs: [keep], activeId: keep.id }
}

/** Close tabs to the right of fromId (keep fromId and left). */
export function closeResultTabsToRightState<T extends ResultTabRef>(
  state: ResultTabsState<T>,
  fromId: string,
): ResultTabsState<T> {
  const index = state.tabs.findIndex((tab) => tab.id === fromId)
  if (index < 0) return state
  const tabs = state.tabs.slice(0, index + 1)
  const activeId = tabs.some((tab) => tab.id === state.activeId) ? state.activeId : fromId
  return { tabs, activeId }
}

export function clearResultTabsToast(count: number): string {
  if (count <= 0) return '没有可清空的结果'
  return `已清空 ${count.toLocaleString('zh-CN')} 个结果标签`
}

export function closeResultTabToast(): string {
  return '已关闭结果标签'
}

export function closeOtherResultTabsToast(closed: number): string {
  if (closed <= 0) return '没有其他结果标签'
  return `已关闭其他 ${closed.toLocaleString('zh-CN')} 个结果标签`
}

export function closeResultTabsToRightToast(closed: number): string {
  if (closed <= 0) return '右侧没有结果标签'
  return `已关闭右侧 ${closed.toLocaleString('zh-CN')} 个结果标签`
}
