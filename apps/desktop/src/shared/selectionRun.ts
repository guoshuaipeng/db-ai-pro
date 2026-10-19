/** Selection-scoped SQL run labels and feedback (M143). */

import type { EditorSelectionInfo } from './editorSelection'
import { runSqlButtonLabel, runSqlButtonTitle } from './multiStatementRun'

export function hasEditorSelection(
  info: EditorSelectionInfo | null | undefined,
): boolean {
  return Boolean(info && info.charCount > 0)
}

export function selectionRunButtonLabel(
  hasSelection: boolean,
  bufferStatementCount: number,
): string {
  if (hasSelection) return '运行选区'
  return runSqlButtonLabel(bufferStatementCount)
}

export function selectionRunButtonTitle(
  hasSelection: boolean,
  info: EditorSelectionInfo | null | undefined,
  bufferStatementCount: number,
): string {
  if (hasSelection && info && info.charCount > 0) {
    const span =
      info.lineCount > 1
        ? `${info.lineCount} 行 · ${info.charCount} 字符`
        : `${info.charCount} 字符`
    return `只运行当前选区（${span}）。取消选区后将按整份脚本运行。`
  }
  return runSqlButtonTitle(bufferStatementCount)
}

export function selectionRunDoneToast(): string {
  return '已运行选中语句（未改动编辑器全文）'
}

export function selectionRunBannerTitle(): string {
  return '将运行选区'
}

export function selectionRunBannerBody(info: EditorSelectionInfo): string {
  const span =
    info.lineCount > 1
      ? `${info.lineCount} 行 · ${info.charCount.toLocaleString('zh-CN')} 字符`
      : `${info.charCount.toLocaleString('zh-CN')} 字符`
  return `已选 ${span}。点「运行选区」只执行选中 SQL；清空选区后恢复运行整份脚本。`
}

export function selectionRunEmptyBody(): string {
  return '当前没有选中文本。在编辑器中拖选一段 SQL 后，运行将只执行选区。'
}

/** Banner must wait until drag/keyboard selection has settled — never mid-pointer-drag. */
export function selectionRunBannerVisible(
  hasSelection: boolean,
  selectionSettled: boolean,
): boolean {
  return hasSelection && selectionSettled
}

/** Idle delay after keyboard/shift selection before chrome updates (ms). */
export const SELECTION_SETTLE_MS = 140
