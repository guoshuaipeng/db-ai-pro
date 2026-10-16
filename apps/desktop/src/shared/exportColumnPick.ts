/** Helpers for picking columns before result export. */

export type ExportFormat = 'csv' | 'json' | 'markdown' | 'html' | 'excel'

export const EXPORT_FORMAT_LABELS: Record<ExportFormat, string> = {
  csv: 'CSV',
  json: 'JSON',
  markdown: 'Markdown',
  html: 'HTML',
  excel: 'Excel',
}

/** Visible exportable columns (hide internal __rowid__). */
export function defaultExportColumns(columns: string[]): string[] {
  const visible = columns.filter((column) => column !== '__rowid__')
  return visible.length > 0 ? visible : [...columns]
}

/** Keep checklist order aligned with `all`; drop unknown / empty. */
export function normalizePickedColumns(all: string[], picked: readonly string[]): string[] {
  const allowed = new Set(defaultExportColumns(all))
  const seen = new Set<string>()
  const out: string[] = []
  for (const column of picked) {
    if (!allowed.has(column) || seen.has(column)) continue
    seen.add(column)
    out.push(column)
  }
  // Preserve table order
  return defaultExportColumns(all).filter((column) => seen.has(column))
}

export function togglePickedColumn(picked: readonly string[], column: string, enabled: boolean): string[] {
  if (enabled) {
    if (picked.includes(column)) return [...picked]
    return [...picked, column]
  }
  return picked.filter((name) => name !== column)
}

export function selectAllExportColumns(columns: string[]): string[] {
  return defaultExportColumns(columns)
}

export function selectNoneExportColumns(): string[] {
  return []
}

/** Which row set to write when exporting from the result grid. */
export type ExportRowScope = 'selected' | 'all'

/** Default scope: prefer selected rows when any are selected. */
export function defaultExportRowScope(selectedRowCount: number): ExportRowScope {
  return selectedRowCount > 0 ? 'selected' : 'all'
}

/** Resolve the row list for the chosen scope. */
export function resolveExportRows<T>(
  allRows: readonly T[],
  selectedRows: readonly T[] | undefined,
  scope: ExportRowScope,
): T[] {
  if (scope === 'selected' && selectedRows && selectedRows.length > 0) {
    return [...selectedRows]
  }
  return [...allRows]
}

/** Chinese summary line for the export dialog body. */
export function exportRowScopeSummary(
  scope: ExportRowScope,
  allCount: number,
  selectedCount: number,
): string {
  const all = allCount.toLocaleString('zh-CN')
  if (selectedCount <= 0) {
    return `将导出当前表格中的 ${all} 行（已应用筛选与列筛选）。默认全选可见列。`
  }
  const sel = selectedCount.toLocaleString('zh-CN')
  if (scope === 'selected') {
    return `将导出已选中的 ${sel} 行（共 ${all} 行筛选结果）。默认全选可见列。`
  }
  return `将导出全部 ${all} 行筛选结果（忽略当前 ${sel} 行选中）。默认全选可见列。`
}

/** Short label for scope radios. */
export function exportRowScopeOptionLabel(
  scope: ExportRowScope,
  allCount: number,
  selectedCount: number,
): string {
  if (scope === 'selected') {
    return `仅选中行（${selectedCount.toLocaleString('zh-CN')}）`
  }
  return `全部筛选结果（${allCount.toLocaleString('zh-CN')}）`
}

