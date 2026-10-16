import {
  cellDisplayKind,
  formatCellDisplay,
} from '@shared/cellDisplay'

/** @deprecated Prefer formatCellDisplay; kept for existing imports. */
export function formatCell(value: unknown): string {
  return formatCellDisplay(value)
}

export function isNumericColumn(rows: Record<string, unknown>[], key: string): boolean {
  let seen = false
  for (const row of rows) {
    const value = row[key]
    if (value == null || value === '') continue
    seen = true
    if (typeof value !== 'number') return false
  }
  return seen
}

export { cellDisplayKind, formatCellDisplay }
