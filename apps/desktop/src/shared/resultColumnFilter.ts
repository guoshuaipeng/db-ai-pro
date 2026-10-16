/** Per-column filters for result grids (compose with global text filter). */

export type ColumnFilterMode = 'contains' | 'equals' | 'empty' | 'notEmpty'

export type ColumnFilter = {
  mode: ColumnFilterMode
  /** Used by contains / equals; ignored for empty / notEmpty. */
  value: string
}

export type ColumnFilters = Record<string, ColumnFilter>

export const COLUMN_FILTER_MODE_LABELS: Record<ColumnFilterMode, string> = {
  contains: '包含',
  equals: '等于',
  empty: '为空',
  notEmpty: '非空',
}

export function isColumnFilterActive(filter: ColumnFilter | undefined): boolean {
  if (!filter) return false
  if (filter.mode === 'empty' || filter.mode === 'notEmpty') return true
  return filter.value.trim().length > 0
}

export function countActiveColumnFilters(filters: ColumnFilters): number {
  let n = 0
  for (const filter of Object.values(filters)) {
    if (isColumnFilterActive(filter)) n += 1
  }
  return n
}

/** Plain text for matching (null → empty string so「为空」works). */
export function cellTextForColumnFilter(value: unknown): string {
  if (value == null) return ''
  if (typeof value === 'string') return value
  if (typeof value === 'number' || typeof value === 'boolean' || typeof value === 'bigint') {
    return String(value)
  }
  if (typeof value === 'object' && value && 'type' in value && (value as { type?: string }).type === 'blob') {
    return '二进制'
  }
  try {
    return JSON.stringify(value)
  } catch {
    return String(value)
  }
}

export function matchColumnFilter(value: unknown, filter: ColumnFilter): boolean {
  if (!isColumnFilterActive(filter)) return true
  const text = cellTextForColumnFilter(value)
  if (filter.mode === 'empty') return text.length === 0
  if (filter.mode === 'notEmpty') return text.length > 0
  const needle = filter.value.trim().toLowerCase()
  const hay = text.toLowerCase()
  if (filter.mode === 'equals') return hay === needle
  return hay.includes(needle)
}

/** AND across active column filters. */
export function applyColumnFilters(
  rows: Record<string, unknown>[],
  filters: ColumnFilters,
): Record<string, unknown>[] {
  const active = Object.entries(filters).filter(([, filter]) => isColumnFilterActive(filter))
  if (active.length === 0) return rows
  return rows.filter((row) =>
    active.every(([column, filter]) => matchColumnFilter(row[column], filter)),
  )
}

export function setColumnFilter(
  filters: ColumnFilters,
  column: string,
  next: ColumnFilter | null,
): ColumnFilters {
  const out = { ...filters }
  if (!next || !isColumnFilterActive(next)) {
    delete out[column]
  } else {
    out[column] = { mode: next.mode, value: next.value }
  }
  return out
}
