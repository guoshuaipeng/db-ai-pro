/** Compact result-pane summary segments (Chinese). */

import { formatElapsedMs } from './slowQuery'

export type ResultSummaryInput = {
  kind: 'grid' | 'message' | 'plan' | 'empty'
  /** Rows returned by the active grid (pre client-filter). */
  returnedRows?: number
  /** Rows currently shown (after global + column filters). */
  shownRows?: number
  selectedRows?: number
  /** Visible / returned column count for grids. */
  columnCount?: number
  elapsedMs?: number | null
  slow?: boolean
  affectedRows?: number | null
  resultSetCount?: number
}

export type ResultSummaryPart = {
  key: string
  text: string
  tone?: 'muted' | 'slow' | 'ok' | 'accent'
}

export function buildResultSummaryParts(input: ResultSummaryInput): ResultSummaryPart[] {
  const parts: ResultSummaryPart[] = []
  if (input.kind === 'empty') return parts

  if (input.kind === 'grid') {
    const returned = input.returnedRows ?? 0
    const shown = input.shownRows ?? returned
    parts.push({ key: 'returned', text: `返回 ${returned.toLocaleString('zh-CN')} 行`, tone: 'ok' })
    if (shown !== returned) {
      parts.push({
        key: 'shown',
        text: `显示 ${shown.toLocaleString('zh-CN')} 行`,
        tone: 'accent',
      })
    }
    if ((input.selectedRows ?? 0) > 0) {
      parts.push({
        key: 'selected',
        text: `已选 ${input.selectedRows!.toLocaleString('zh-CN')}`,
        tone: 'muted',
      })
    }
    if (typeof input.columnCount === 'number' && input.columnCount > 0) {
      parts.push({
        key: 'cols',
        text: `${input.columnCount.toLocaleString('zh-CN')} 列`,
        tone: 'muted',
      })
    }
    if ((input.resultSetCount ?? 0) > 1) {
      parts.push({
        key: 'sets',
        text: `${input.resultSetCount} 个结果集`,
        tone: 'muted',
      })
    }
  } else if (input.kind === 'message') {
    if (typeof input.affectedRows === 'number' && input.affectedRows >= 0) {
      parts.push({
        key: 'affected',
        text: `影响 ${input.affectedRows.toLocaleString('zh-CN')} 行`,
        tone: 'ok',
      })
    } else {
      parts.push({ key: 'message', text: '消息', tone: 'muted' })
    }
  } else if (input.kind === 'plan') {
    parts.push({ key: 'plan', text: '执行计划', tone: 'muted' })
  }

  if (typeof input.elapsedMs === 'number' && Number.isFinite(input.elapsedMs)) {
    parts.push({
      key: 'elapsed',
      text: formatElapsedMs(input.elapsedMs),
      tone: input.slow ? 'slow' : 'muted',
    })
    if (input.slow) {
      parts.push({ key: 'slow', text: '慢', tone: 'slow' })
    }
  }

  return parts
}

/** Plain clipboard line for the summary bar. */
export function formatResultSummaryClipboard(parts: readonly ResultSummaryPart[]): string {
  return parts.map((part) => part.text).join(' · ')
}

export function resultSummaryCopiedToast(partCount: number): string {
  const n = Math.max(0, partCount)
  if (n === 0) return '没有可复制的摘要'
  return '已复制结果摘要'
}

export function resultGridEmptyTitle(): string {
  return '没有返回行'
}

export function resultGridEmptyBody(): string {
  return '查询已成功执行，但结果集为空。可检查 WHERE / JOIN，或改用 COUNT(*) 确认是否有匹配数据。'
}
