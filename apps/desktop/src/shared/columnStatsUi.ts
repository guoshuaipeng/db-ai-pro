/** Column stats panel copy & clipboard (M152). */

import type { ColumnStats } from './columnStats'

export function columnStatsKicker(): string {
  return '列统计'
}

export function columnStatsSourceResult(): string {
  return '基于当前结果集'
}

export function columnStatsSourceTable(tableName: string): string {
  return `表 ${tableName} · 最多 1000 行抽样`
}

export function columnStatsEmptyTitle(): string {
  return '没有可分析的行'
}

export function columnStatsEmptyBody(): string {
  return '当前结果为空，或抽样查询未返回行。先运行查询或确认表中有数据后再试。'
}

export function columnStatsErrorTitle(): string {
  return '统计失败'
}

export function columnStatsSamplesEmptyTitle(): string {
  return '没有非空样例'
}

export function columnStatsSamplesEmptyBody(): string {
  return '该列在抽样范围内全部为空。可检查过滤条件，或换一列再看分布。'
}

export function columnStatsNullRatioLabel(): string {
  return '空值占比'
}

export function columnStatsDistinctRatioLabel(): string {
  return '去重占比'
}

export function columnStatsAnalyzedNote(rowCap: number): string {
  return `已分析 ${rowCap.toLocaleString('zh-CN')} 行`
}

export function columnStatsTypeLabel(numeric: boolean): string {
  return numeric ? '数值' : '文本'
}

export function nullRatioPercent(stats: ColumnStats): number {
  if (stats.count <= 0) return 0
  return Math.round((stats.nulls / stats.count) * 1000) / 10
}

export function distinctRatioPercent(stats: ColumnStats): number {
  const nonNull = stats.count - stats.nulls
  if (nonNull <= 0) return 0
  return Math.round((stats.distinct / nonNull) * 1000) / 10
}

export function formatColumnStatsClipboard(input: {
  column: string
  sourceLabel: string
  stats: ColumnStats
  rowCap: number
}): string {
  const { column, sourceLabel, stats, rowCap } = input
  const lines = [
    `列统计：${column}`,
    sourceLabel,
    `行数 ${stats.count} · 空值 ${stats.nulls}（${nullRatioPercent(stats)}%） · 去重 ${stats.distinct}（${distinctRatioPercent(stats)}%）`,
    `类型 ${columnStatsTypeLabel(stats.numeric)} · 最小 ${stats.min ?? '—'} · 最大 ${stats.max ?? '—'}`,
    columnStatsAnalyzedNote(rowCap),
  ]
  if (stats.samples.length > 0) {
    lines.push(`样例：${stats.samples.join(' · ')}`)
  }
  return lines.join('\n')
}

export function columnStatsCopiedToast(): string {
  return '已复制列统计摘要'
}

export function columnStatsSampleCopiedToast(): string {
  return '已复制样例值'
}

export function columnStatsCopyLabel(): string {
  return '复制摘要'
}

export function columnStatsRefreshLabel(): string {
  return '重新计算'
}

export function columnStatsSamplesHeading(): string {
  return '样例值'
}
