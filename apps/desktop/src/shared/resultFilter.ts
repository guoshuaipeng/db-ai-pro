/** Client-side text filter for result grids. */

export function filterResultRows(
  rows: Record<string, unknown>[],
  query: string,
  columns?: string[],
): Record<string, unknown>[] {
  const needle = query.trim().toLowerCase()
  if (!needle) return rows
  return rows.filter((row) => {
    const keys = columns?.length ? columns : Object.keys(row)
    return keys.some((key) => {
      if (key === '__rowid__') return false
      const value = row[key]
      if (value == null) return false
      const text = typeof value === 'object' ? JSON.stringify(value) : String(value)
      return text.toLowerCase().includes(needle)
    })
  })
}
