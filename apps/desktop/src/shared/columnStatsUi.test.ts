import { describe, expect, it } from 'vitest'
import type { ColumnStats } from './columnStats'
import {
  columnStatsEmptyTitle,
  distinctRatioPercent,
  formatColumnStatsClipboard,
  nullRatioPercent,
} from './columnStatsUi'

const base: ColumnStats = {
  column: 'amount',
  count: 10,
  nulls: 2,
  distinct: 4,
  numeric: true,
  min: '1',
  max: '9',
  samples: ['1', '2'],
}

describe('columnStatsUi', () => {
  it('computes ratios and clipboard text', () => {
    expect(nullRatioPercent(base)).toBe(20)
    expect(distinctRatioPercent(base)).toBe(50)
    expect(columnStatsEmptyTitle()).toContain('没有')
    const text = formatColumnStatsClipboard({
      column: 'amount',
      sourceLabel: '基于当前结果集',
      stats: base,
      rowCap: 10,
    })
    expect(text).toContain('amount')
    expect(text).toContain('空值 2')
    expect(text).toContain('样例')
  })
})
