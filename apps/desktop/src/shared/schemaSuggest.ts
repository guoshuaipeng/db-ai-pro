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

const SQL_KEYWORDS = [
  'SELECT',
  'FROM',
  'WHERE',
  'JOIN',
  'LEFT JOIN',
  'INNER JOIN',
  'ON',
  'GROUP BY',
  'ORDER BY',
  'LIMIT',
  'INSERT INTO',
  'UPDATE',
  'DELETE FROM',
  'CREATE TABLE',
  'ALTER TABLE',
  'DROP TABLE',
  'AND',
  'OR',
  'AS',
  'DISTINCT',
  'COUNT',
  'SUM',
  'AVG',
  'MAX',
  'MIN',
]

function walk(nodes: SchemaNode[], visit: (node: SchemaNode) => void): void {
  for (const node of nodes) {
    visit(node)
    if (node.children) walk(node.children, visit)
  }
}

/** Build Monaco-oriented suggestions from the live object tree. */
export function suggestionsFromSchema(
  nodes: SchemaNode[],
  connectionId: string | null,
): SchemaSuggestItem[] {
  const scoped = connectionId ? nodes.filter((node) => node.id === connectionId || node.connectionId === connectionId) : nodes
  const tables = new Map<string, SchemaSuggestItem>()
  const columns: SchemaSuggestItem[] = []

  walk(scoped, (node) => {
    if (node.kind === 'table' && node.tableName) {
      const name = node.tableName
      if (!tables.has(name.toLowerCase())) {
        tables.set(name.toLowerCase(), {
          label: name,
          kind: 'table',
          detail: node.displayName !== name ? node.displayName : '表',
          insertText: name,
          rank: 30,
        })
      }
    }
    if (node.kind === 'column' && node.name) {
      const table = node.tableName ? `${node.tableName}.` : ''
      columns.push({
        label: node.name,
        kind: 'column',
        detail: [node.dataType, node.tableName].filter(Boolean).join(' · ') || '列',
        insertText: node.name,
        rank: 20,
      })
      if (node.tableName) {
        columns.push({
          label: `${node.tableName}.${node.name}`,
          kind: 'column',
          detail: node.dataType || '列',
          insertText: `${node.tableName}.${node.name}`,
          rank: 18,
        })
      }
      void table
    }
    if (node.kind === 'key' && node.redisKey) {
      columns.push({
        label: node.redisKey,
        kind: 'column',
        detail: node.redisType ? `Redis ${node.redisType}` : 'Redis key',
        insertText: node.redisKey,
        rank: 10,
      })
    }
  })

  const keywords: SchemaSuggestItem[] = SQL_KEYWORDS.map((word) => ({
    label: word,
    kind: 'keyword',
    detail: 'SQL',
    insertText: word,
    rank: 5,
  }))

  return [...tables.values(), ...columns, ...keywords]
}

export function filterSuggestions(items: SchemaSuggestItem[], prefix: string, limit = 40): SchemaSuggestItem[] {
  const needle = prefix.trim().toLowerCase()
  const scored = items
    .map((item) => {
      const label = item.label.toLowerCase()
      let score = item.rank
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
