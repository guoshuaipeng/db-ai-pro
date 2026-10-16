/** Compact result-pane summary segments (Chinese). */

import { formatElapsedMs } from './slowQuery'

export type ResultSummaryInput = {
  kind: 'grid' | 'message' | 'plan' | 'empty'
  /** Rows returned by the active grid (pre client-filter). */
  returnedRows?: number
  /** Rows currently shown (after global + column filters). */
  shownRows?: number
  selectedRows?: number
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
