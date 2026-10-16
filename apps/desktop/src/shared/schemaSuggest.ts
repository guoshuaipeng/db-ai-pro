import type { SchemaNode } from './types'

export type SchemaSuggestKind = 'table' | 'column' | 'keyword'

export type SchemaSuggestItem = {
  label: string
  kind: SchemaSuggestKind
  detail?: string
  insertText: string
  /** Higher = more preferred when ranking. */
  rank: number
}

/** Coarse SQL clause context for ranking autocomplete. */
export type SqlSuggestContext = 'table' | 'column' | 'keyword' | 'general'

const SQL_KEYWORDS = [
  'SELECT',
  'FROM',
  'WHERE',
  'JOIN',
  'LEFT JOIN',
  'INNER JOIN',
  'RIGHT JOIN',
  'FULL JOIN',
  'ON',
  'GROUP BY',
  'ORDER BY',
  'HAVING',
  'LIMIT',
  'OFFSET',
  'INSERT INTO',
  'VALUES',
  'UPDATE',
  'SET',
  'DELETE FROM',
  'CREATE TABLE',
  'ALTER TABLE',
  'DROP TABLE',
  'WITH',
  'UNION',
  'UNION ALL',
  'CASE',
  'WHEN',
  'THEN',
  'ELSE',
  'END',
  'AND',
  'OR',
  'NOT',
  'IN',
  'IS',
  'NULL',
  'BETWEEN',
  'LIKE',
  'AS',
  'DISTINCT',
  'COUNT',
  'SUM',
  'AVG',
  'MAX',
  'MIN',
  'EXISTS',
  'INTO',
]

export function suggestKindLabel(kind: SchemaSuggestKind): string {
  switch (kind) {
    case 'table':
      return '表'
    case 'column':
      return '列'
    default:
      return '关键字'
  }
}

/**
 * Infer whether the user is likely typing a table, column, or keyword
 * from the SQL text before the cursor (single-line heuristic is fine for Monaco).
 */
export function detectSqlSuggestContext(sqlBeforeCursor: string): SqlSuggestContext {
  const raw = sqlBeforeCursor.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/--[^\n]*/g, ' ')
  const line = raw.replace(/\s+/g, ' ').trimEnd()
  if (!line) return 'keyword'

  if (/\b(FROM|JOIN|UPDATE|INTO|TABLE)\s+[\w."`]*$/i.test(line)) return 'table'
  if (/\b(FROM|JOIN|UPDATE|INTO|TABLE)\s*$/i.test(line)) return 'table'

  if (/\b(SELECT|WHERE|ON|AND|OR|SET|HAVING|BY|WHEN|VALUES)\s+[\w."`,\s]*$/i.test(line)) return 'column'
  if (/\b(SELECT|WHERE|ON|AND|OR|SET|HAVING|BY|WHEN|VALUES)\s*$/i.test(line)) return 'column'
  if (/,\s*[\w."`]*$/i.test(line) && /\bSELECT\b/i.test(line)) return 'column'

  if (/^\s*[A-Z]*$/i.test(line.trim()) || line.trim().length < 3) return 'keyword'
  return 'general'
}

function walk(nodes: SchemaNode[], visit: (node: SchemaNode) => void): void {
  for (const node of nodes) {
    visit(node)
    if (node.children) walk(node.children, visit)
  }
}

function withKindDetail(kind: SchemaSuggestKind, detail?: string): string {
  const label = suggestKindLabel(kind)
  const extra = (detail ?? '').trim()
  if (!extra || extra === label) return label
  if (extra.startsWith(label)) return extra
  return `${label} · ${extra}`
}

/** Build Monaco-oriented suggestions from the live object tree. */
export function suggestionsFromSchema(
  nodes: SchemaNode[],
  connectionId: string | null,
): SchemaSuggestItem[] {
  const scoped = connectionId
    ? nodes.filter((node) => node.id === connectionId || node.connectionId === connectionId)
    : nodes
  const tables = new Map<string, SchemaSuggestItem>()
  const columns: SchemaSuggestItem[] = []

  walk(scoped, (node) => {
    if (node.kind === 'table' && node.tableName) {
      const name = node.tableName
      if (!tables.has(name.toLowerCase())) {
        tables.set(name.toLowerCase(), {
          label: name,
          kind: 'table',
          detail: withKindDetail(
            'table',
            node.displayName !== name ? node.displayName : undefined,
          ),
          insertText: name,
          rank: 30,
        })
      }
    }
    if (node.kind === 'column' && node.name) {
      columns.push({
        label: node.name,
        kind: 'column',
        detail: withKindDetail(
          'column',
          [node.dataType, node.tableName].filter(Boolean).join(' · ') || undefined,
        ),
        insertText: node.name,
        rank: 20,
      })
      if (node.tableName) {
        columns.push({
          label: `${node.tableName}.${node.name}`,
          kind: 'column',
          detail: withKindDetail('column', node.dataType || undefined),
          insertText: `${node.tableName}.${node.name}`,
          rank: 18,
        })
      }
    }
    if (node.kind === 'key' && node.redisKey) {
      columns.push({
        label: node.redisKey,
        kind: 'column',
        detail: withKindDetail(
          'column',
          node.redisType ? `Redis ${node.redisType}` : 'Redis key',
        ),
        insertText: node.redisKey,
        rank: 10,
      })
    }
  })

  const keywords: SchemaSuggestItem[] = SQL_KEYWORDS.map((word) => ({
    label: word,
    kind: 'keyword' as const,
    detail: withKindDetail('keyword'),
    insertText: word,
    rank: 5,
  }))

  return [...tables.values(), ...columns, ...keywords]
}

export function schemaSuggestObjectCount(items: readonly SchemaSuggestItem[]): number {
  return items.reduce((n, item) => n + (item.kind === 'keyword' ? 0 : 1), 0)
}

export function suggestEditorOverlayBody(hasSchemaObjects: boolean): string {
  if (!hasSchemaObjects) {
    return '编写 SQL，按 F5 运行。连接并刷新对象树后，可用 Ctrl+Space 补全表与列。'
  }
  return '编写 SQL，按 F5 运行 · Ctrl+Space 按上下文补全表/列/关键字 · 可拖入收藏/历史/对象名或 .sql 文件'
}

export function filterSuggestions(
  items: SchemaSuggestItem[],
  prefix: string,
  limit = 40,
  context: SqlSuggestContext = 'general',
): SchemaSuggestItem[] {
  const needle = prefix.trim().toLowerCase()
  const scored = items
    .map((item) => {
      const label = item.label.toLowerCase()
      let score = item.rank
      if (context === 'table' && item.kind === 'table') score += 45
      else if (context === 'column' && item.kind === 'column') score += 45
      else if (context === 'keyword' && item.kind === 'keyword') score += 25
      else if (context === 'general' && item.kind !== 'keyword') score += 8

      if (!needle) return { item, score }
      if (label === needle) score += 100
      else if (label.startsWith(needle)) score += 60
      else if (label.includes(needle)) score += 30
      else if (item.detail?.toLowerCase().includes(needle)) score += 10
      else return null
      return { item, score }
    })
    .filter((row): row is { item: SchemaSuggestItem; score: number } => row !== null)

  scored.sort((a, b) => b.score - a.score || a.item.label.localeCompare(b.item.label))
  const seen = new Set<string>()
  const out: SchemaSuggestItem[] = []
  for (const row of scored) {
    const key = `${row.item.kind}:${row.item.insertText}`
    if (seen.has(key)) continue
    seen.add(key)
    out.push(row.item)
    if (out.length >= limit) break
  }
  return out
}
