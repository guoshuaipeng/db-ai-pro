/** Chinese copy for editor find / replace open feedback (M116). */

export type EditorFindMode = 'find' | 'replace'

export type EditorFindSelection = {
  charCount: number
  lineCount: number
} | null

export function editorFindHasSelection(selection: EditorFindSelection): boolean {
  return !!selection && selection.charCount > 0
}

export function editorFindIsMultiline(selection: EditorFindSelection): boolean {
  return !!selection && selection.lineCount > 1
}

/** Toolbar / command title (always useful; selection-aware). */
export function editorFindButtonTitle(mode: EditorFindMode, selection: EditorFindSelection): string {
  const multi = editorFindIsMultiline(selection)
  const has = editorFindHasSelection(selection)
  if (mode === 'replace') {
    if (multi) return '替换（Ctrl+H；多行选区将优先在选区内查找）'
    if (has) return '替换（Ctrl+H；已用选区填入查找内容）'
    return '替换（Ctrl+H）'
  }
  if (multi) return '查找（Ctrl+F；多行选区将优先在选区内查找）'
  if (has) return '查找（Ctrl+F；已用选区填入查找内容）'
  return '查找（Ctrl+F）'
}

/**
 * Toast after opening find/replace.
 * Returns null when there is no selection — avoid noisy toasts on plain Ctrl+F.
 */
export function editorFindOpenedToast(
  mode: EditorFindMode,
  selection: EditorFindSelection,
): string | null {
  if (!editorFindHasSelection(selection)) return null
  const multi = editorFindIsMultiline(selection)
  if (mode === 'replace') {
    return multi
      ? '已打开替换 · 多行选区将优先在选区内查找'
      : '已打开替换 · 已用选区填入查找内容'
  }
  return multi
    ? '已打开查找 · 多行选区将优先在选区内查找'
    : '已打开查找 · 已用选区填入查找内容'
}
