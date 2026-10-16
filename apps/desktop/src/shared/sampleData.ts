import type { Dialect } from './types'
import type { TableColumnInfo } from './tableStructure'
import { identStyle, quoteIdent } from './sql'

export type SampleFillPlan = {
  tableName: string
  dialect: Dialect
  count: number
  columns: string[]
  /** Auto-increment / identity PKs omitted from INSERT. */
  skippedColumns: string[]
  rows: Record<string, unknown>[]
  sql: string
}

type Kind = 'int' | 'float' | 'bool' | 'date' | 'datetime' | 'uuid' | 'text' | 'json'

function classify(dataType: string): Kind {
  const t = dataType.toLowerCase()
  if (/uuid|guid/.test(t)) return 'uuid'
  if (/bool|bit\b/.test(t)) return 'bool'
  if (/date\b/.test(t) && !/time/.test(t)) return 'date'
  if (/time|timestamp|datetime/.test(t)) return 'datetime'
  if (/json|jsonb/.test(t)) return 'json'
  if (/int|serial|number\(\d+\)|numeric\(\d+\)|bigint|smallint|tinyint/.test(t) && !/interval/.test(t)) {
    if (/decimal|numeric|real|double|float|money/.test(t)) return 'float'
    return 'int'
  }
  if (/decimal|numeric|real|double|float|money|number/.test(t)) return 'float'
  return 'text'
}

function omitForDialect(column: TableColumnInfo, dialect: Dialect): boolean {
  if (!column.primaryKey) return false
  const t = (column.dataType || '').toLowerCase()
  if (dialect === 'sqlite' && (/int/.test(t) || t === '' || t === 'integer')) return true
  if ((dialect === 'postgresql' || dialect === 'mysql' || dialect === 'mariadb') && /serial|auto_increment|identity/.test(t)) {
    return true
  }
  if (dialect === 'sqlserver' && /identity/.test(t)) return true
  return /serial|identity|autoincrement|auto_increment/.test(t)
}

function mulberry32(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const FIRST = ['Ada', 'Lin', 'Kai', 'Mia', 'Noah', 'Ivy', 'Leo', 'Uma', 'Rex', 'Sky']
const LAST = ['Chen', 'Wang', 'Li', 'Zhang', 'Liu', 'Zhou', 'Wu', 'Xu', 'Sun', 'Ma']
const WORDS = ['alpha', 'bravo', 'cedar', 'delta', 'echo', 'frost', 'grove', 'harbor', 'ivory', 'jade']

function sqlLiteral(value: unknown, dialect: Dialect): string {
  if (value === null) return 'NULL'
  if (typeof value === 'number') return Number.isFinite(value) ? String(value) : 'NULL'
  if (typeof value === 'boolean') {
    if (dialect === 'sqlserver') return value ? '1' : '0'
    return value ? 'TRUE' : 'FALSE'
  }
  const text = String(value).replace(/'/g, "''")
  return `'${text}'`
}

function sampleValue(
  column: TableColumnInfo,
  index: number,
  rand: () => number,
): unknown {
  if (column.nullable && rand() < 0.12) return null
  const kind = classify(column.dataType || 'TEXT')
  switch (kind) {
    case 'int':
      return column.primaryKey ? index + 1 : Math.floor(rand() * 10_000) + index
    case 'float':
      return Math.round((rand() * 1000 + index) * 100) / 100
    case 'bool':
      return rand() > 0.5
    case 'date': {
      const day = new Date(Date.UTC(2024, 0, 1 + (index % 28)))
      return day.toISOString().slice(0, 10)
    }
    case 'datetime': {
      const day = new Date(Date.UTC(2024, 0, 1 + (index % 28), 8 + (index % 10), 30))
      return day.toISOString().replace('T', ' ').slice(0, 19)
    }
    case 'uuid': {
      const hex = () => Math.floor(rand() * 16).toString(16)
      const block = (n: number) => Array.from({ length: n }, hex).join('')
      return `${block(8)}-${block(4)}-4${block(3)}-a${block(3)}-${block(12)}`
    }
    case 'json':
      return JSON.stringify({ id: index + 1, tag: WORDS[index % WORDS.length] })
    case 'text':
    default: {
      const name = `${FIRST[index % FIRST.length]} ${LAST[(index * 3) % LAST.length]}`
      if (/email/i.test(column.name)) return `user${index + 1}@example.com`
      if (/phone|mobile|tel/i.test(column.name)) return `1${String(3000000000 + index).slice(0, 10)}`
      if (/name|title|label/i.test(column.name)) return name
      if (/city|region|area/i.test(column.name)) return WORDS[index % WORDS.length]
      if (/status|state|type/i.test(column.name)) return WORDS[(index + 2) % WORDS.length]
      return `${WORDS[index % WORDS.length]}-${index + 1}`
    }
  }
}

/** Build N plausible INSERT statements (previewable) from table column metadata. */
export function generateSampleFill(input: {
  tableName: string
  dialect: Dialect
  columns: TableColumnInfo[]
  count?: number
  seed?: number
}): SampleFillPlan {
  const count = Math.min(200, Math.max(1, Math.round(input.count ?? 5)))
  const rand = mulberry32(input.seed ?? 14)
  const style = identStyle(input.dialect)
  const quote = (name: string) => quoteIdent(name, style)
  const skippedColumns = input.columns
    .filter((column) => omitForDialect(column, input.dialect))
    .map((column) => column.name)
  const usable = input.columns.filter((column) => !omitForDialect(column, input.dialect))
  const columns = (usable.length ? usable : input.columns).map((column) => column.name)

  const meta = (usable.length ? usable : input.columns)
  const rows: Record<string, unknown>[] = []
  for (let i = 0; i < count; i += 1) {
    const row: Record<string, unknown> = {}
    for (const column of meta) {
      row[column.name] = sampleValue(column, i, rand)
    }
    rows.push(row)
  }

  const colList = columns.map(quote).join(', ')
  const statements = rows.map((row) => {
    const values = columns.map((name) => sqlLiteral(row[name], input.dialect)).join(', ')
    return `INSERT INTO ${quote(input.tableName)} (${colList}) VALUES (${values});`
  })

  return {
    tableName: input.tableName,
    dialect: input.dialect,
    count,
    columns,
    skippedColumns,
    rows,
    sql: statements.join('\n'),
  }
}
