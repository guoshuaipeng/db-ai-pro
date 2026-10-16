export function rowsToCsv(columns: string[], rows: Record<string, unknown>[]): string {
  const escape = (value: unknown): string => {
    if (value == null) return ''
    const text = typeof value === 'object' ? JSON.stringify(value) : String(value)
    if (/[",\n\r]/.test(text)) return `"${text.replace(/"/g, '""')}"`
    return text
  }
  const lines = [columns.map(escape).join(',')]
  for (const row of rows) {
    lines.push(columns.map((column) => escape(row[column])).join(','))
  }
  return `${lines.join('\n')}\n`
}

export function rowsToJson(columns: string[], rows: Record<string, unknown>[]): string {
  const cleaned = rows.map((row) => {
    const next: Record<string, unknown> = {}
    for (const column of columns) next[column] = row[column] ?? null
    return next
  })
  return `${JSON.stringify(cleaned, null, 2)}\n`
}
