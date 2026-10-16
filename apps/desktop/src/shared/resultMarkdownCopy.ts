/** Copy result grid as GitHub-flavored Markdown table (M96). */

import { capExportRows, rowsToMarkdown } from './exportTable'

/** Soft cap so clipboard paste into chat/docs stays responsive. */
export const MARKDOWN_CLIPBOARD_ROW_CAP = 2_000

export function buildResultMarkdownClipboard(
  columns: readonly string[],
  rows: Record<string, unknown>[],
): { text: string; rowCount: number; truncated: boolean; total: number } {
  const cols = [...columns]
  const { rows: capped, truncated, total } = capExportRows(rows, MARKDOWN_CLIPBOARD_ROW_CAP)
  const text = cols.length === 0 ? '' : rowsToMarkdown(cols, capped)
  return { text, rowCount: capped.length, truncated, total }
}

export function resultMarkdownCopiedToast(rowCount: number, truncated: boolean): string {
  const n = rowCount.toLocaleString('zh-CN')
  if (truncated) return `已复制 Markdown（前 ${n} 行，已截断）`
  return `已复制 Markdown（${n} 行）`
}
