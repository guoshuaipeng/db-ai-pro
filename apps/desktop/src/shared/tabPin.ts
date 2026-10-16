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
