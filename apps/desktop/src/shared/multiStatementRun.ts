/** Multi-statement run labels, summaries, and toasts (M142). */

import { formatElapsedMs } from './slowQuery'
import { countSqlStatements } from './sqlStatementCount'

export type MultiRunStatement = {
  ok: boolean
  elapsedMs?: number
  rows?: unknown[] | null
}

export type MultiRunStats = {
  total: number
  ok: number
  failed: number
  elapsedMs: number
  rowCount: number
}

export function summarizeMultiRun(statements: readonly MultiRunStatement[]): MultiRunStats {
  let ok = 0
  let failed = 0
  let elapsedMs = 0
  let rowCount = 0
  for (const item of statements) {
    if (item.ok) ok += 1
    else failed += 1
    elapsedMs += item.elapsedMs || 0
    rowCount += item.rows?.length ?? 0
  }
  return { total: statements.length, ok, failed, elapsedMs, rowCount }
}

export function runSqlButtonLabel(statementCount: number): string {
  if (statementCount >= 2) return `运行 ${statementCount} 条`
  return '运行'
}

export function runSqlButtonTitle(statementCount: number): string {
  if (statementCount >= 2) {
    return `按顺序运行全部 ${statementCount} 条语句（有选区时只跑选中部分；字符串/注释内分号不计）`
  }
  return '运行（有选区时只跑选中语句）'
}

export function multiRunSuccessToast(stats: MultiRunStats): string {
  if (stats.total < 2) return '执行完成'
  return `已执行 ${stats.total} 条语句 · ${formatElapsedMs(stats.elapsedMs)}`
}

export function multiRunFailureToast(stats: MultiRunStats, firstError: string): string {
  const err = firstError.trim() || '执行失败'
  if (stats.total < 2) return err
  return `${stats.total} 条中有 ${stats.failed} 条失败：${err}`
}

export function multiRunNotificationTitle(stats: MultiRunStats, ok: boolean): string {
  if (!ok) {
    return stats.total >= 2 ? '部分语句失败' : '查询失败'
  }
  return stats.total >= 2 ? '多语句执行完成' : '查询完成'
}

export function multiRunNotificationDetail(stats: MultiRunStats, connectionName: string): string {
  const timing = `${formatElapsedMs(stats.elapsedMs)} · ${connectionName}`
  if (stats.total < 2) {
    return `${stats.rowCount} 行 · ${timing}`
  }
  if (stats.failed > 0) {
    return `${stats.ok}/${stats.total} 成功 · ${timing}`
  }
  return `${stats.total} 条全部成功 · ${stats.rowCount} 行 · ${timing}`
}

export function multiRunMessagesTabTitle(statementTotal: number, gridTotal: number): string {
  if (statementTotal >= 2) return `消息 · ${statementTotal} 条语句`
  if (gridTotal > 1) return `消息 · ${gridTotal} 个结果集`
  return '消息'
}

export function multiRunEmptyMessagesBody(statementTotal: number): string {
  if (statementTotal >= 2) {
    return '这批语句没有文本消息。可切换上方结果页查看各条返回的数据网格。'
  }
  return '本次运行没有附加消息。'
}

/** Statement count for the Run button from the current editor buffer. */
export function runBufferStatementCount(sql: string | null | undefined): number {
  return countSqlStatements(sql)
}
