export type ColumnStats = {
  column: string
  count: number
  nulls: number
  distinct: number
  numeric: boolean
  min: string | null
  max: string | null
  samples: string[]
}

function asDisplay(value: unknown): string {
  if (value == null) return 'NULL'
  if (typeof value === 'object') return JSON.stringify(value)
  return String(value)
}

function asNumber(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'bigint') return Number(value)
  if (typeof value === 'string' && value.trim() !== '' && !Number.isNaN(Number(value))) return Number(value)
  return null
}

/** Lightweight column profile over an in-memory result set. */
export function profileColumn(rows: Record<string, unknown>[], column: string): ColumnStats {
  const count = rows.length
  let nulls = 0
  let numericHits = 0
  let seenNonNull = 0
  let minNum: number | null = null
  let maxNum: number | null = null
  let minText: string | null = null
  let maxText: string | null = null
  const distinct = new Map<string, unknown>()

  for (const row of rows) {
    const value = row[column]
    if (value == null || value === '') {
      nulls += 1
      continue
    }
    seenNonNull += 1
    const key = asDisplay(value)
    if (!distinct.has(key)) distinct.set(key, value)
    const num = asNumber(value)
    if (num != null) {
      numericHits += 1
      if (minNum == null || num < minNum) minNum = num
      if (maxNum == null || num > maxNum) maxNum = num
    } else {
      if (minText == null || key < minText) minText = key
      if (maxText == null || key > maxText) maxText = key
    }
  }

  const numeric = seenNonNull > 0 && numericHits / seenNonNull >= 0.8
  const samples = [...distinct.keys()].slice(0, 8)

  return {
    column,
    count,
    nulls,
    distinct: distinct.size,
    numeric,
    min: numeric ? (minNum == null ? null : String(minNum)) : minText,
    max: numeric ? (maxNum == null ? null : String(maxNum)) : maxText,
    samples,
  }
}
