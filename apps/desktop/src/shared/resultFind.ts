export type ResultFindHit = { row: number; col: number }

/** Plain text used for substring search (null → empty). */
export function resultCellSearchText(value: unknown): string {
  if (value == null) return ''
  if (typeof value === 'string') return value
  if (typeof value === 'number' || typeof value === 'boolean' || typeof value === 'bigint') {
    return String(value)
  }
  try {
    return JSON.stringify(value)
  } catch {
    return String(value)
  }
}

export function collectResultFindHits(
  rows: Record<string, unknown>[],
  columns: string[],
  query: string,
  options?: { caseSensitive?: boolean },
): ResultFindHit[] {
  const raw = query.trim()
  if (!raw || columns.length === 0 || rows.length === 0) return []
  const caseSensitive = options?.caseSensitive === true
  const needle = caseSensitive ? raw : raw.toLowerCase()
  const hits: ResultFindHit[] = []
  for (let row = 0; row < rows.length; row += 1) {
    const record = rows[row] ?? {}
    for (let col = 0; col < columns.length; col += 1) {
      const column = columns[col]!
      const hay = resultCellSearchText(record[column])
      const haystack = caseSensitive ? hay : hay.toLowerCase()
      if (haystack.includes(needle)) hits.push({ row, col })
    }
  }
  return hits
}

/** Wrap-around step; returns -1 when length is 0. */
export function stepFindIndex(current: number, delta: number, length: number): number {
  if (length <= 0) return -1
  if (current < 0 || current >= length) return delta >= 0 ? 0 : length - 1
  return (current + delta + length * 10) % length
}
