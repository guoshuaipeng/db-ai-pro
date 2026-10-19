/** Schema-aware local AI preview — never invent retail demo SQL for other DBs. */

import type { TableSpec } from './schema'
import { searchRelevantTables } from './tableCatalog'
import { draftLocalAnswer } from './session'

export type DraftLocalPreviewInput = {
  prompt: string
  tables: readonly TableSpec[]
  dialect?: string
  databaseName?: string | null
  /** Open browse table / SQL focus hint. */
  preferredTable?: string | null
}

function quoteIdent(dialect: string, name: string): string {
  if (dialect === 'postgres' || dialect === 'postgresql') return `"${name.replace(/"/g, '""')}"`
  if (dialect === 'mssql') return `[${name.replace(/]/g, ']]')}]`
  if (dialect === 'sqlite') return `"${name.replace(/"/g, '""')}"`
  return `\`${name.replace(/`/g, '``')}\``
}

function qualifyTable(dialect: string, table: string, databaseName?: string | null): string {
  const t = quoteIdent(dialect, table)
  const db = databaseName?.trim()
  if (!db || dialect === 'sqlite') return t
  return `${quoteIdent(dialect, db)}.${t}`
}

function pickColumns(table: TableSpec, limit = 8): string[] {
  const cols = table.columns.map((c) => c.name).filter(Boolean)
  if (cols.length === 0) return ['*']
  const ranked = [...cols].sort((a, b) => {
    const score = (n: string) => {
      const x = n.toLowerCase()
      if (x === 'id' || x.endsWith('_id')) return 0
      if (/name|title|user|email|status|region|city|avatar/.test(x)) return 1
      return 2
    }
    return score(a) - score(b) || a.localeCompare(b)
  })
  return ranked.slice(0, limit)
}

function isCountIntent(prompt: string): boolean {
  return /多少|数量|总数|行数|count\b|多少条|有多少/i.test(prompt)
}

function findPreferred(tables: readonly TableSpec[], preferred?: string | null): TableSpec | null {
  const want = preferred?.trim()
  if (!want) return null
  const exact = tables.find((t) => t.name.toLowerCase() === want.toLowerCase())
  if (exact) return exact
  return tables.find((t) => t.name.toLowerCase().includes(want.toLowerCase())) ?? null
}

/** True when catalog looks like the built-in retail sample (safe to use demo SQL templates). */
export function isRetailSampleCatalog(tables: readonly TableSpec[]): boolean {
  const names = new Set(tables.map((t) => t.name.toLowerCase()))
  return names.has('customers') && (names.has('orders') || names.has('products'))
}

/**
 * Local preview answer grounded in `tables`.
 * Never falls back to demo `customers` SQL unless the catalog is the retail sample.
 */
export function draftLocalPreviewAnswer(input: DraftLocalPreviewInput): string {
  const prompt = input.prompt.trim()
  const dialect = (input.dialect || 'mysql').toLowerCase()
  const db = input.databaseName?.trim() || undefined
  const tables = [...input.tables]

  if (tables.length === 0) {
    const scope = db ? `库「${db}」` : '当前连接'
    return (
      `当前${scope}还没有读到表结构，无法起草可靠 SQL。\n\n` +
      `请先在对象树展开并刷新该库，或确认标签已绑定正确的数据库后再问。`
    )
  }

  // Retail sample only: keep familiar demo templates.
  if (isRetailSampleCatalog(tables) && (!db || /retail/i.test(db))) {
    return draftLocalAnswer(prompt)
  }

  const preferred = findPreferred(tables, input.preferredTable)
  const hits = searchRelevantTables(tables, prompt, 6)
  let table: TableSpec | null = null
  if (
    preferred &&
    (hits.some((h) => h.name.toLowerCase() === preferred.name.toLowerCase()) ||
      /客户|用户|表|数据|多少|count|查询|列出/i.test(prompt))
  ) {
    table = preferred
  }
  if (!table && hits.length > 0 && hits[0]!.score > 0) {
    table = tables.find((t) => t.name.toLowerCase() === hits[0]!.name.toLowerCase()) ?? null
  }
  if (!table && preferred) table = preferred
  if (!table) {
    table =
      (hits[0] ? tables.find((t) => t.name.toLowerCase() === hits[0]!.name.toLowerCase()) : null) ??
      tables[0]!
  }

  const qname = qualifyTable(dialect, table.name, db)
  const cols = pickColumns(table)
  const colSql =
    cols.length === 1 && cols[0] === '*'
      ? '*'
      : cols.map((c) => quoteIdent(dialect, c)).join(',\n  ')

  if (isCountIntent(prompt)) {
    const lead = db
      ? `统计「${db}」库中表 ${table.name} 的行数。`
      : `统计表 ${table.name} 的行数。`
    const sql = `SELECT COUNT(*) AS row_count\nFROM ${qname};`
    return `${lead}\n\n\`\`\`sql\n${sql}\n\`\`\``
  }

  const lead = db
    ? `根据「${db}」库中的 ${table.name} 起草查询（本地预览，未调用模型）。`
    : `根据表 ${table.name} 起草查询（本地预览，未调用模型）。`
  const sql = `SELECT\n  ${colSql}\nFROM ${qname}\nLIMIT 100;`
  return `${lead}\n\n\`\`\`sql\n${sql}\n\`\`\``
}

/** Extract a simple table hint from open SQL (best-effort). */
export function preferredTableFromSql(sql: string | null | undefined): string | null {
  if (!sql) return null
  const patterns = [
    /\bFROM\s+`(?:[^`]+)`\.`([^`]+)`/i,
    /\bFROM\s+"?(?:[\w-]+)"?\."?([\w-]+)"?/i,
    /\bFROM\s+`([^`]+)`/i,
    /\bFROM\s+"?([\w-]+)"?/i,
  ]
  for (const re of patterns) {
    const m = sql.match(re)
    if (m?.[1]?.trim()) return m[1].trim()
  }
  return null
}
