import type { EditorTabState } from './types'

export function isTabPinned(tab: Pick<EditorTabState, 'pinned'>): boolean {
  return tab.pinned === true
}

/** Stable: all pinned (keep relative order), then unpinned (keep relative order). */
export function sortPinnedFirst<T extends { pinned?: boolean }>(tabs: T[]): T[] {
  if (tabs.length < 2) return tabs.slice()
  const pinned: T[] = []
  const rest: T[] = []
  for (const tab of tabs) {
    if (tab.pinned) pinned.push(tab)
    else rest.push(tab)
  }
  if (pinned.length === 0) return tabs.slice()
  return pinned.concat(rest)
}

export function togglePinnedFlag<T extends object>(
  tab: T & { pinned?: boolean },
  pinned?: boolean,
): T & { pinned?: boolean } {
  const next = pinned ?? !Boolean(tab.pinned)
  if (next) return { ...tab, pinned: true }
  const { pinned: _drop, ...rest } = tab
  return rest as T & { pinned?: boolean }
}

/** Tabs that close-others would remove (unpinned, not the keep id). */
export function closeOthersTargets<T extends { id: string; pinned?: boolean }>(
  tabs: T[],
  keepId: string,
): T[] {
  return tabs.filter((tab) => tab.id !== keepId && !isTabPinned(tab))
}

/** Tabs that close-to-right would remove (strictly after index, unpinned). */
export function closeToRightTargets<T extends { id: string; pinned?: boolean }>(
  tabs: T[],
  fromId: string,
): T[] {
  const index = tabs.findIndex((tab) => tab.id === fromId)
  if (index < 0) return []
  return tabs.slice(index + 1).filter((tab) => !isTabPinned(tab))
}

/**
 * Move `fromId` so it sits at `insertBeforeIndex` in the resulting array.
 * Clamped to the pinned or unpinned group — unpinned cannot enter the pin zone.
 */
export function moveTabToIndex<T extends { id: string; pinned?: boolean }>(
  tabs: T[],
  fromId: string,
  insertBeforeIndex: number,
): T[] {
  const from = tabs.findIndex((tab) => tab.id === fromId)
  if (from < 0) return tabs.slice()
  const item = tabs[from]!
  const pinned = isTabPinned(item)
  const next = tabs.slice()
  next.splice(from, 1)
  const remainingPinned = next.reduce((n, tab) => n + (isTabPinned(tab) ? 1 : 0), 0)
  const lo = pinned ? 0 : remainingPinned
  const hi = pinned ? remainingPinned : next.length
  let dest = insertBeforeIndex
  if (from < insertBeforeIndex) dest -= 1
  dest = Math.max(lo, Math.min(hi, dest))
  next.splice(dest, 0, item)
  const unchanged = next.every((tab, index) => tab.id === tabs[index]?.id)
  return unchanged ? tabs.slice() : next
}

