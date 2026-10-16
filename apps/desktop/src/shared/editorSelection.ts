/** Status-bar label for non-empty editor selection (M93). */

export type EditorSelectionInfo = {
  charCount: number
  lineCount: number
}

/** Build selection stats from selected text + line range (1-based inclusive). */
export function editorSelectionInfo(
  selectedText: string,
  startLine: number,
  endLine: number,
): EditorSelectionInfo | null {
  if (!selectedText) return null
  const lineCount = Math.max(1, Math.abs(endLine - startLine) + 1)
  return { charCount: selectedText.length, lineCount }
}

export function editorSelectionStatusLabel(info: EditorSelectionInfo | null | undefined): string | null {
  if (!info || info.charCount <= 0) return null
  const chars = info.charCount.toLocaleString('zh-CN')
  if (info.lineCount <= 1) return `已选 ${chars} 字符`
  const lines = info.lineCount.toLocaleString('zh-CN')
  return `已选 ${lines} 行 · ${chars} 字符`
}

export function editorSelectionStatusTitle(): string {
  return '当前编辑器选区（有选区时运行 SQL 只跑选区）'
}
