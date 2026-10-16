import type { Dialect } from './types'
import { splitSql } from './sql'

export type ExplainBuild =
  | { ok: true; sql: string; label: string }
  | { ok: false; error: string }

/** Pick the first non-empty statement for EXPLAIN. */
export function primaryStatement(sql: string): string | null {
  const parts = splitSql(sql)
  return parts[0] ?? null
}

export function buildExplainSql(dialect: Dialect, sql: string): ExplainBuild {
  const statement = primaryStatement(sql)
  if (!statement) return { ok: false, error: '没有可解释的 SQL' }
  const stripped = statement.replace(/^\s*(explain(\s+query\s+plan)?|describe|desc)\b/i, '').trim()
  const target = stripped || statement

  if (dialect === 'sqlite') {
    return { ok: true, sql: `EXPLAIN QUERY PLAN ${target}`, label: 'EXPLAIN QUERY PLAN' }
  }
  if (dialect === 'mysql' || dialect === 'mariadb') {
    return { ok: true, sql: `EXPLAIN ${target}`, label: 'EXPLAIN' }
  }
  if (dialect === 'postgresql') {
    return { ok: true, sql: `EXPLAIN (FORMAT TEXT) ${target}`, label: 'EXPLAIN' }
  }
  if (dialect === 'sqlserver') {
    // SHOWPLAN_ALL returns plan rows without executing the statement body.
    return {
      ok: true,
      sql: `SET SHOWPLAN_ALL ON;\n${target};\nSET SHOWPLAN_ALL OFF;`,
      label: 'SHOWPLAN_ALL',
    }
  }
  if (dialect === 'redis') {
    return { ok: false, error: 'Redis 不支持 SQL 执行计划' }
  }
  return { ok: false, error: '当前数据库类型还不支持执行计划' }
}

export function formatExplainText(columns: string[] | undefined, rows: Record<string, unknown>[] | undefined): string {
  if (!columns?.length || !rows?.length) return '（没有返回执行计划行）'
  const widths = columns.map((column) =>
    Math.min(
      48,
      Math.max(column.length, ...rows.map((row) => String(row[column] ?? '').length)),
    ),
  )
  const line = (values: string[]) =>
    values.map((value, index) => value.padEnd(widths[index]).slice(0, widths[index])).join('  ')
  const header = line(columns)
  const sep = widths.map((width) => '-'.repeat(width)).join('  ')
  const body = rows.map((row) => line(columns.map((column) => String(row[column] ?? ''))))
  return [header, sep, ...body].join('\n')
}

export type ExplainSummary = {
  isEmpty: boolean
  lineCount: number
  /** Human-readable warning chips (Chinese). */
  warnings: string[]
  /** Short status line for the plan header. */
  statusLabel: string
}

const EMPTY_MARKERS = ['（没有返回执行计划行）', '(没有返回执行计划行)', '没有返回执行计划行']

export function looksLikeExplainEmpty(message: string | null | undefined): boolean {
  const text = (message ?? '').trim()
  if (!text) return true
  return EMPTY_MARKERS.some((marker) => text === marker || text.includes(marker))
}

/** Scan plan text for common full-scan / expensive patterns. */
export function detectExplainWarnings(message: string): string[] {
  const text = message || ''
  const warnings: string[] = []
  if (/\bSeq Scan\b|\bSequential Scan\b/i.test(text)) warnings.push('顺序扫描')
  if (/\bTable Scan\b/i.test(text)) warnings.push('表扫描')
  // SQLite: SCAN without USING INDEX often means full scan
  if (/(^|\n)\s*SCAN\b/i.test(text) && !/\bUSING (?:INDEX|COVERING INDEX)\b/i.test(text)) {
    if (!warnings.includes('表扫描') && !warnings.includes('顺序扫描')) warnings.push('表扫描')
  }
  // MySQL EXPLAIN: type ALL
  if (/\bpossible_keys\b/i.test(text) && /(^|\s|\t)ALL(\s|\t|$)/m.test(text)) {
    warnings.push('全表扫描')
  }
  if (/\bNested Loop\b/i.test(text) && /\bSeq Scan\b/i.test(text)) {
    warnings.push('嵌套循环 + 顺序扫描')
  }
  return [...new Set(warnings)]
}

export function summarizeExplainText(message: string | null | undefined): ExplainSummary {
  const raw = (message ?? '').replace(/\r\n/g, '\n')
  const isEmpty = looksLikeExplainEmpty(raw)
  if (isEmpty) {
    return {
      isEmpty: true,
      lineCount: 0,
      warnings: [],
      statusLabel: '没有执行计划行',
    }
  }
  const lines = raw.split('\n').filter((line) => line.trim().length > 0)
  const warnings = detectExplainWarnings(raw)
  const statusLabel =
    warnings.length > 0
      ? `${lines.length} 行 · ${warnings.length} 项需关注`
      : `${lines.length} 行计划`
  return { isEmpty: false, lineCount: lines.length, warnings, statusLabel }
}

export function explainEmptyTitle(): string {
  return '没有执行计划'
}

export function explainEmptyBody(): string {
  return '引擎没有返回计划行。确认当前连接支持 EXPLAIN，且编辑器中有可解释的 SQL（非空、非仅注释）。'
}

export function explainPlanCopiedToast(): string {
  return '已复制执行计划'
}

export function explainReexplainLabel(): string {
  return '再次解释'
}
