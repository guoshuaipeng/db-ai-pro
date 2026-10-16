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
