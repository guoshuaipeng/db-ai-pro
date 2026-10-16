/** Result-grid cell display: distinguish NULL vs empty string (M78). */

export type CellDisplayKind = 'null' | 'empty' | 'value'

export function cellDisplayKind(value: unknown): CellDisplayKind {
  if (value == null) return 'null'
  if (typeof value === 'string' && value.length === 0) return 'empty'
  return 'value'
}

/** Visible marker in the grid (clipboard uses cellClipboardText). */
export function formatCellDisplay(value: unknown): string {
  const kind = cellDisplayKind(value)
  if (kind === 'null') return 'NULL'
  if (kind === 'empty') return '""'
  if (typeof value === 'number') {
    if (Number.isInteger(value)) return String(value)
    return new Intl.NumberFormat('zh-CN', { maximumFractionDigits: 2 }).format(value)
  }
  if (typeof value === 'string') return value
  if (
    typeof value === 'object' &&
    value &&
    'type' in value &&
    (value as { type?: string }).type === 'blob'
  ) {
    return '二进制'
  }
  return String(value)
}

/** Tooltip hint for null vs empty. */
export function cellDisplayHint(value: unknown): string {
  const kind = cellDisplayKind(value)
  if (kind === 'null') return 'NULL（数据库空值）'
  if (kind === 'empty') return '空字符串 ""'
  return formatCellDisplay(value)
}

/** Clipboard: both NULL and empty copy as empty string. */
export function cellClipboardText(value: unknown): string {
  const kind = cellDisplayKind(value)
  if (kind === 'null' || kind === 'empty') return ''
  return formatCellDisplay(value)
}

