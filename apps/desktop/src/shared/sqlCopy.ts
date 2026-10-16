/** Build SQL IN (...) / VALUES snippets from cell values. */

export const SQL_COPY_CAP = 5_000

export function sqlLiteral(value: unknown): string {
  if (value == null) return 'NULL'
  if (typeof value === 'boolean') return value ? 'TRUE' : 'FALSE'
  if (typeof value === 'bigint') return String(value)
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) return 'NULL'
    return String(value)
  }
  if (typeof value === 'object') {
    const row = value as { type?: string }
    if (row.type === 'blob') return 'NULL'
    return quoteSqlString(JSON.stringify(value))
  }
  return quoteSqlString(String(value))
}

export function quoteSqlString(text: string): string {
  return `'${text.replace(/'/g, "''")}'`
}

export function uniqueInOrder<T>(values: T[], keyFn: (value: T) => string): T[] {
  const seen = new Set<string>()
  const out: T[] = []
  for (const value of values) {
    const key = keyFn(value)
    if (seen.has(key)) continue
    seen.add(key)
    out.push(value)
  }
  return out
}

export function valuesToInList(
  values: unknown[],
  options?: { distinct?: boolean; cap?: number },
): { sql: string; truncated: boolean; count: number } {
  const cap = options?.cap ?? SQL_COPY_CAP
  let list = values
  if (options?.distinct !== false) {
    list = uniqueInOrder(list, (value) => sqlLiteral(value))
  }
  const truncated = list.length > cap
  const sliced = truncated ? list.slice(0, cap) : list
  return {
    sql: `(${sliced.map(sqlLiteral).join(', ')})`,
    truncated,
    count: sliced.length,
  }
}

/** Single-column VALUES (v1), (v2), … or multi-column rows. */
export function rowsToValuesSql(
  rows: unknown[][],
  options?: { cap?: number },
): { sql: string; truncated: boolean; count: number } {
  const cap = options?.cap ?? SQL_COPY_CAP
  const truncated = rows.length > cap
  const sliced = truncated ? rows.slice(0, cap) : rows
  const body = sliced.map((row) => `(${row.map(sqlLiteral).join(', ')})`).join(',\n')
  return { sql: body, truncated, count: sliced.length }
}

export function columnValues(
  rows: Record<string, unknown>[],
  column: string,
): unknown[] {
  return rows.map((row) => row[column] ?? null)
}

export function rowTuples(
  rows: Record<string, unknown>[],
  columns: string[],
): unknown[][] {
  return rows.map((row) => columns.map((column) => row[column] ?? null))
}
