import type { Dialect } from './types'
import { identStyle, quoteIdent } from './sql'

export type ImportColumnMapping = {
  source: string
  /** null = skip this source column */
  target: string | null
}

export type InferredType = 'INTEGER' | 'REAL' | 'TEXT'

export type ImportSheetData = {
  headers: string[]
  rows: Record<string, string>[]
  format: 'csv' | 'xlsx'
  fileName: string
}

function sqlLiteral(value: string, dialect: Dialect): string {
  if (value === '') return 'NULL'
  if (/^-?\d+$/.test(value)) return value
  if (/^-?\d+\.\d+$/.test(value)) return value
  const lower = value.toLowerCase()
  if (lower === 'true' || lower === 'false') {
    if (dialect === 'sqlserver') return lower === 'true' ? '1' : '0'
    return lower === 'true' ? 'TRUE' : 'FALSE'
  }
  return `'${value.replace(/'/g, "''")}'`
}

export function inferSqliteType(values: string[]): InferredType {
  let seen = 0
  let ints = 0
  let reals = 0
  for (const value of values) {
    if (value == null || value.trim() === '') continue
    seen += 1
    const trimmed = value.trim()
    if (/^-?\d+$/.test(trimmed)) ints += 1
    else if (/^-?\d+\.\d+$/.test(trimmed)) reals += 1
  }
  if (!seen) return 'TEXT'
  if (ints === seen) return 'INTEGER'
  if (ints + reals === seen) return 'REAL'
  return 'TEXT'
}

export function autoMapColumns(sourceHeaders: string[], targetColumns: string[]): ImportColumnMapping[] {
  const lower = new Map(targetColumns.map((name) => [name.toLowerCase(), name]))
  return sourceHeaders.map((source) => ({
    source,
    target: lower.get(source.toLowerCase()) ?? null,
  }))
}

export function buildSqliteCreateTable(
  tableName: string,
  headers: string[],
  rows: Record<string, string>[],
): string {
  const quote = (name: string) => quoteIdent(name, 'ansi')
  const cols = headers.map((header) => {
    const samples = rows.slice(0, 50).map((row) => row[header] ?? '')
    const type = inferSqliteType(samples)
    return `  ${quote(header)} ${type}`
  })
  return `CREATE TABLE IF NOT EXISTS ${quote(tableName)} (\n${cols.join(',\n')}\n);`
}

export function mappedPreviewRows(
  rows: Record<string, string>[],
  mapping: ImportColumnMapping[],
  limit = 8,
): Record<string, string>[] {
  const active = mapping.filter((item) => item.target)
  return rows.slice(0, limit).map((row) => {
    const next: Record<string, string> = {}
    for (const item of active) next[item.target!] = row[item.source] ?? ''
    return next
  })
}

/** Build multi-row INSERT statements in batches. */
export function buildInsertBatches(input: {
  tableName: string
  dialect: Dialect
  mapping: ImportColumnMapping[]
  rows: Record<string, string>[]
  batchSize?: number
}): string[] {
  const batchSize = Math.min(100, Math.max(1, input.batchSize ?? 40))
  const style = identStyle(input.dialect)
  const quote = (name: string) => quoteIdent(name, style)
  const active = input.mapping.filter((item): item is ImportColumnMapping & { target: string } => Boolean(item.target))
  if (!active.length) return []
  const colList = active.map((item) => quote(item.target)).join(', ')
  const batches: string[] = []
  for (let i = 0; i < input.rows.length; i += batchSize) {
    const slice = input.rows.slice(i, i + batchSize)
    const values = slice
      .map((row) => {
        const cells = active.map((item) => sqlLiteral(row[item.source] ?? '', input.dialect)).join(', ')
        return `(${cells})`
      })
      .join(',\n  ')
    batches.push(`INSERT INTO ${quote(input.tableName)} (${colList}) VALUES\n  ${values};`)
  }
  return batches
}
