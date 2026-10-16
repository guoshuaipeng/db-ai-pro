export function formatCell(value: unknown): string {
  if (value == null) return '—'
  if (typeof value === 'number') {
    if (Number.isInteger(value)) return String(value)
    return new Intl.NumberFormat('zh-CN', { maximumFractionDigits: 2 }).format(value)
  }
  if (typeof value === 'string') return value
  if (typeof value === 'object' && value && 'type' in value && (value as { type?: string }).type === 'blob') {
    return '二进制'
  }
  return String(value)
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
