/** Copy result grid as pretty JSON array (M99). */

import { capExportRows, rowsToJson } from './exportTable'

/** Soft cap so clipboard paste stays responsive. */
export const JSON_CLIPBOARD_ROW_CAP = 2_000

export function buildResultJsonClipboard(
  columns: readonly string[],
  rows: Record<string, unknown>[],
): { text: string; rowCount: number; truncated: boolean; total: number } {
  const cols = [...columns]
  const { rows: capped, truncated, total } = capExportRows(rows, JSON_CLIPBOARD_ROW_CAP)
  const text = cols.length === 0 ? '' : rowsToJson(cols, capped)
  return { text, rowCount: capped.length, truncated, total }
}

export function resultJsonCopiedToast(rowCount: number, truncated: boolean): string {
  const n = rowCount.toLocaleString('zh-CN')
  if (truncated) return `已复制 JSON（前 ${n} 行，已截断）`
  return `已复制 JSON（${n} 行）`
}
