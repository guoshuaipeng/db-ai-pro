/** Filter helpers for the query-tab overflow picker (M66). */

export type TabPickerItem = {
  id: string
  /** Display label (may include dirty • prefix). */
  label: string
  pinned?: boolean
  badge?: string
}

/** Case-insensitive substring match on label / badge; empty query returns all. */
export function filterTabsForPicker(
  tabs: readonly TabPickerItem[],
  query: string,
): TabPickerItem[] {
  const q = query.trim().toLowerCase()
  if (!q) return tabs.slice()
  return tabs.filter((tab) => {
    if (tab.label.toLowerCase().includes(q)) return true
    if (tab.badge?.toLowerCase().includes(q)) return true
    return false
  })
}
