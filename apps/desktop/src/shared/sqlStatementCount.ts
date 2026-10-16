/** Status-bar label for multi-statement editor SQL (M91). */

import { splitSql } from './sql'

export function countSqlStatements(sql: string | null | undefined): number {
  if (!sql || !sql.trim()) return 0
  return splitSql(sql).length
}

/** Hide for 0/1 statements to keep the bar quiet. */
export function sqlStatementCountLabel(count: number): string | null {
  if (count < 2) return null
  return `${count} 条语句`
}

export function sqlStatementCountTitle(count: number): string {
  return `当前编辑器可拆分为 ${count} 条语句（按分号，字符串/注释内分号不计）`
}
