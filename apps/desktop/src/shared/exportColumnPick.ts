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
