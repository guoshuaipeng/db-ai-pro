/** Format result-grid column names for clipboard (M89). */

export type HeaderCopyFormat = 'tsv' | 'csv' | 'comma' | 'newline'

const ROWID = '__rowid__'

export function visibleResultColumns(columns: readonly string[]): string[] {
  return columns.filter((column) => column !== ROWID)
}

function escapeCsvField(value: string): string {
  if (/[",\n\r]/.test(value)) return `"${value.replace(/"/g, '""')}"`
  return value
}

/** Default TSV: one header row for pasting into Excel / sheets. */
export function formatColumnHeaders(
  columns: readonly string[],
  format: HeaderCopyFormat = 'tsv',
): string {
  const cols = visibleResultColumns(columns)
  if (cols.length === 0) return ''
  if (format === 'newline') return cols.join('\n')
  if (format === 'comma') return cols.join(', ')
  if (format === 'csv') return cols.map(escapeCsvField).join(',')
  return cols.join('\t')
}

export function columnHeadersCopiedToast(count: number): string {
  return `已复制 ${count} 个列名`
}
