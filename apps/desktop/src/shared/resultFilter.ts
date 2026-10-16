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

export function resultFilterActive(query: string): boolean {
  return query.trim().length > 0
}

/** Empty-state body when a text filter matches no rows. */
export function resultFilterEmptyBody(query: string): string {
  const q = query.trim()
  if (!q) return '没有匹配的行。'
  const shown = q.length > 24 ? `${q.slice(0, 24)}…` : q
  return `没有包含「${shown}」的行。可清除筛选或换个关键字。`
}

export function resultFilterClearedToast(): string {
  return '已清除结果筛选'
}

