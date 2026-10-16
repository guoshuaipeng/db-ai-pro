import { describe, expect, it } from 'vitest'
import { analyzeChartData } from './chartData'
import {
  chartEmptyTitle,
  chartSkipFromAnalysis,
  formatChartSummaryClipboard,
} from './chartUi'

describe('chartUi', () => {
  it('maps skip reasons to Chinese empty copy', () => {
    const skip = analyzeChartData(['name'], [{ name: 'a' }])
    expect(skip.ok).toBe(false)
    if (skip.ok) return
    expect(chartEmptyTitle(skip.reason)).toContain('数值')
    const mapped = chartSkipFromAnalysis(skip)
    expect(mapped.body).toContain('数值')
  })

  it('formats clipboard summary for a model', () => {
    const model = analyzeChartData(
      ['region', 'amount'],
      [
        { region: '华东', amount: 10 },
        { region: '华北', amount: 20 },
      ],
    )
    expect(model.ok).toBe(true)
    if (!model.ok) return
    const text = formatChartSummaryClipboard(model, 'bar')
    expect(text).toContain('柱状图')
    expect(text).toContain('amount')
    expect(text).toContain('min')
  })
})
