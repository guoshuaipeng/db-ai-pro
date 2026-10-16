import { splitSql } from './sql'

export type DestructiveHit = {
  statement: string
  kind: 'drop' | 'truncate' | 'delete-no-where'
  summary: string
}

export type DestructiveAnalysis = {
  destructive: boolean
  hits: DestructiveHit[]
}

function stripNoise(sql: string): string {
  return sql
    .replace(/--.*$/gm, ' ')
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function hasWhereClause(sql: string): boolean {
  return /\bwhere\b/i.test(sql)
}

function classify(statement: string): DestructiveHit | null {
  const cleaned = stripNoise(statement)
  if (!cleaned) return null
  if (/^drop\b/i.test(cleaned)) {
    return { statement, kind: 'drop', summary: 'DROP（删除对象）' }
  }
  if (/^truncate\b/i.test(cleaned)) {
    return { statement, kind: 'truncate', summary: 'TRUNCATE（清空表）' }
  }
  if (/^delete\b/i.test(cleaned) && !hasWhereClause(cleaned)) {
    return { statement, kind: 'delete-no-where', summary: 'DELETE 且未带 WHERE（可能清空全表）' }
  }
  return null
}

/** Heuristic scan for DROP / TRUNCATE / DELETE without WHERE. */
export function analyzeDestructiveSql(sql: string): DestructiveAnalysis {
  const hits: DestructiveHit[] = []
  for (const statement of splitSql(sql)) {
    const hit = classify(statement)
    if (hit) hits.push(hit)
  }
  return { destructive: hits.length > 0, hits }
}

export function destructiveSummary(analysis: DestructiveAnalysis): string {
  if (!analysis.destructive) return ''
  const kinds = [...new Set(analysis.hits.map((hit) => hit.summary))]
  return kinds.join('；')
}
