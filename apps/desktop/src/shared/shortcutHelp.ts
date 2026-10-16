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

/** Plain-text clipboard: one shortcut per line (action TAB keys). */
export function formatShortcutHelpClipboard(rows: readonly ShortcutHelpRow[]): string {
  return rows.map((row) => row.action + '\t' + row.keys).join('\n')
}

export function shortcutKeysCopiedToast(action: string): string {
  const name = action.trim() || '快捷键'
  return `已复制「${name}」的按键`
}

export function shortcutListCopiedToast(count: number): string {
  const n = Math.max(0, count)
  if (n === 0) return '没有可复制的快捷键'
  return `已复制 ${n} 条快捷键到剪贴板`
}

export function shortcutHelpEmptyBody(): string {
  return '没有匹配的快捷键。试试更短的关键字，或清除筛选后浏览全部。'
}

