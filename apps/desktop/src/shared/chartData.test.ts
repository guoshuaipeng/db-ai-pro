import { describe, expect, it } from 'vitest'
import { analyzeChartData, canChartResult } from './chartData'

describe('analyzeChartData', () => {
  it('builds a labeled numeric series', () => {
    const columns = ['region', 'amount']
    const rows = [
      { region: '华东', amount: 10 },
      { region: '华北', amount: 20 },
    ]
    const model = analyzeChartData(columns, rows)
    expect(model.ok).toBe(true)
    if (!model.ok) return
    expect(model.labels).toEqual(['华东', '华北'])
    expect(model.series[0]?.key).toBe('amount')
    expect(model.series[0]?.values).toEqual([10, 20])
  })

  it('skips non-numeric grids', () => {
    expect(canChartResult(['name'], [{ name: 'a' }, { name: 'b' }])).toBe(false)
    const skip = analyzeChartData(['name'], [{ name: 'a' }])
    expect(skip.ok).toBe(false)
  })

  it('uses row index when every column is numeric', () => {
    const model = analyzeChartData(['x', 'y'], [{ x: 1, y: 2 }, { x: 3, y: 4 }])
    expect(model.ok).toBe(true)
    if (!model.ok) return
    expect(model.labelColumn).toBeNull()
    expect(model.labels).toEqual(['1', '2'])
    expect(model.series).toHaveLength(2)
  })

  it('ignores __rowid__ and truncates long sets', () => {
    const rows = Array.from({ length: 150 }, (_, i) => ({ __rowid__: i, n: i }))
    const model = analyzeChartData(['__rowid__', 'n'], rows)
    expect(model.ok).toBe(true)
    if (!model.ok) return
    expect(model.truncated).toBe(true)
    expect(model.labels).toHaveLength(120)
    expect(model.series[0]?.key).toBe('n')
  })
})
