import { splitSql } from './sql'

const READ_OK = new Set([
  'select',
  'explain',
  'describe',
  'desc',
  'show',
  'pragma',
  'values',
  'table', // SQLite TABLE x
  'with', // fallback if peel fails mid-way
])

const WRITE_OR_DDL = new Set([
  'insert',
  'update',
  'delete',
  'merge',
  'replace',
  'upsert',
  'create',
  'alter',
  'drop',
  'truncate',
  'rename',
  'grant',
  'revoke',
  'comment',
  'call',
  'exec',
  'execute',
  'load',
  'copy',
  'attach',
  'detach',
  'reindex',
  'vacuum',
  'analyze', // PG ANALYZE mutates stats; block in safe mode
  'begin',
  'start',
  'commit',
  'rollback',
  'savepoint',
])

function stripNoise(sql: string): string {
  return sql
    .replace(/--.*$/gm, ' ')
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

/** Peel leading WITH cte… so the main verb is visible. */
export function peelWithClauses(sql: string): string {
  let s = stripNoise(sql)
  let guard = 0
  while (/^with\b/i.test(s) && guard++ < 32) {
    const asParen = s.search(/\bas\s*\(/i)
    if (asParen < 0) break
    let i = s.indexOf('(', asParen)
    if (i < 0) break
    let depth = 0
    for (; i < s.length; i++) {
      const ch = s[i]
      if (ch === '(') depth += 1
      else if (ch === ')') {
        depth -= 1
        if (depth === 0) {
          i += 1
          break
        }
      }
    }
    s = s.slice(i).replace(/^,\s*/, '').trim()
    if (/^with\b/i.test(s)) continue
    break
  }
  return s
}

export function statementVerb(sql: string): string | null {
  const s = peelWithClauses(sql)
  if (!s) return null
  if (/^(explain|describe|desc)\b/i.test(s)) return 'explain'
  const match = /^([a-zA-Z_]+)\b/.exec(s)
  return match ? match[1].toLowerCase() : null
}

export type ReadOnlyBlock = {
  blocked: boolean
  verb: string | null
  statement: string
  reason: string
}

/** True when statement would mutate schema or data (or open a write txn). */
export function isMutatingStatement(statement: string): boolean {
  const verb = statementVerb(statement)
  if (!verb) return false
  if (verb === 'explain') return false
  if (READ_OK.has(verb)) return false
  if (WRITE_OR_DDL.has(verb)) return true
  // Unknown verbs: allow (e.g. dialect-specific read helpers) unless clearly write-like
  return false
}

export function analyzeReadOnlySql(sql: string): ReadOnlyBlock {
  for (const statement of splitSql(sql)) {
    const cleaned = stripNoise(statement)
    if (!cleaned) continue
    if (isMutatingStatement(statement)) {
      const verb = statementVerb(statement)
      return {
        blocked: true,
        verb,
        statement: cleaned.slice(0, 160),
        reason: verb
          ? `只读模式已拦截 ${verb.toUpperCase()}（允许 SELECT / EXPLAIN / 导出）`
          : '只读模式已拦截写操作或 DDL',
      }
    }
  }
  return { blocked: false, verb: null, statement: '', reason: '' }
}

export function isReadOnlyEffective(globalReadOnly: boolean, connectionReadOnly?: boolean | null): boolean {
  return globalReadOnly === true || connectionReadOnly === true
}
