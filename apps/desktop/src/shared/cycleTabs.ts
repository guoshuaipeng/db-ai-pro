/** Cycle editor / result tab ids (M104). */

export function cycleTabId(
  ids: readonly string[],
  activeId: string | null | undefined,
  delta: 1 | -1,
): string | null {
  if (ids.length === 0) return null
  if (ids.length === 1) return ids[0]!
  const current = activeId && ids.includes(activeId) ? ids.indexOf(activeId) : 0
  const next = (current + delta + ids.length) % ids.length
  return ids[next]!
}

export function cycleResultTabsEmptyToast(): string {
  return '当前没有结果标签可切换'
}

