/** Result chart empty-state copy & summary (M153). */

import type { ChartAnalysis, ChartModel } from './chartData'

export function chartKicker(): string {
  return '结果图表'
}

export function chartEmptyTitle(reason: string): string {
  if (reason.includes('数据行')) return '没有可绘制的数据行'
  if (reason.includes('可绘制的列')) return '没有可绘制的列'
  if (reason.includes('数值')) return '缺少数值列'
  return '当前结果不适合绘图'
}

export function chartEmptyBody(reason: string): string {
  if (reason.includes('数据行')) {
    return '先运行会返回行的查询，或切换到有数据的结果页签后再看图。'
  }
  if (reason.includes('可绘制的列')) {
    return '结果列可能被隐藏，或仅有内部列。显示至少一列后再试。'
  }
  if (reason.includes('数值')) {
    return '图表需要至少一列数值（或可解析为数字的文本）。可改 SELECT 增加聚合列。'
  }
  return reason || '换一个带分类与数值的结果再试。'
}

export function chartBarLabel(): string {
  return '柱状'
}

export function chartLineLabel(): string {
  return '折线'
}

export function chartAxisMeta(model: ChartModel): string {
  const axis = model.labelColumn ? `横轴：${model.labelColumn}` : '横轴：行号'
  const rows = model.truncated
    ? `已截取前 120 / ${model.rowCount} 行`
    : `${model.rowCount} 行`
  return `${axis} · ${rows}`
}

export function chartSeriesToggleHint(): string {
  return '点击系列可显隐'
}

export function formatChartSummaryClipboard(model: ChartModel, kind: 'bar' | 'line'): string {
  const kindLabel = kind === 'bar' ? '柱状图' : '折线图'
  const lines = [
    `结果图表（${kindLabel}）`,
    chartAxisMeta(model),
    `系列：${model.series.map((s) => s.key).join('、') || '（无）'}`,
  ]
  for (const series of model.series) {
    const nums = series.values.filter((n) => Number.isFinite(n))
    if (nums.length === 0) {
      lines.push(`- ${series.key}：无有效值`)
      continue
    }
    const min = Math.min(...nums)
    const max = Math.max(...nums)
    const sum = nums.reduce((a, b) => a + b, 0)
    const avg = sum / nums.length
    const fmt = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(2))
    lines.push(`- ${series.key}：min ${fmt(min)} · max ${fmt(max)} · avg ${fmt(avg)} · n ${nums.length}`)
  }
  return lines.join('\n')
}

export function chartSummaryCopiedToast(): string {
  return '已复制图表摘要'
}

export function chartPngSavedToast(): string {
  return '已导出图表 PNG'
}

export function chartPngFailedToast(): string {
  return '导出 PNG 失败'
}

export function chartCopySummaryLabel(): string {
  return '复制摘要'
}

export function chartExportPngLabel(): string {
  return '导出 PNG'
}

export function chartSkipFromAnalysis(analysis: ChartAnalysis): { title: string; body: string } {
  if (analysis.ok) {
    return { title: chartEmptyTitle(''), body: chartEmptyBody('') }
  }
  return {
    title: chartEmptyTitle(analysis.reason),
    body: chartEmptyBody(analysis.reason),
  }
}
