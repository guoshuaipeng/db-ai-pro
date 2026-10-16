/** Filter helpers for the F1 keyboard shortcuts dialog (M71). */

export type ShortcutHelpRow = {
  action: string
  keys: string
}

/** Case-insensitive match on action or keys; empty query returns all. */
export function filterShortcutHelp(
  rows: readonly ShortcutHelpRow[],
  query: string,
): ShortcutHelpRow[] {
  const q = query.trim().toLowerCase()
  if (!q) return rows.slice()
  return rows.filter((row) => {
    if (row.action.toLowerCase().includes(q)) return true
    if (row.keys.toLowerCase().includes(q)) return true
    // Allow matching without + / · separators: "ctrlk" → "ctrl+k"
    const compactKeys = row.keys.toLowerCase().replace(/[\s·+]/g, '')
    const compactQ = q.replace(/[\s·+]/g, '')
    if (compactQ && compactKeys.includes(compactQ)) return true
    return false
  })
}