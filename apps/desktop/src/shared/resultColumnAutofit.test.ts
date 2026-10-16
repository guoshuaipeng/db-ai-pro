import { describe, expect, it } from 'vitest'
import {
  AUTOFIT_MAX_PX,
  AUTOFIT_MIN_PX,
  cellTextForAutofit,
  estimateAllColumnWidths,
  estimateColumnWidthPx,
  measureTextWidthPx,
} from './resultColumnAutofit'

describe('resultColumnAutofit', () => {
  it('measures CJK wider than latin', () => {
    expect(measureTextWidthPx('名')).toBeGreaterThan(measureTextWidthPx('a'))
  })

  it('stringifies null as em dash', () => {
    expect(cellTextForAutofit(null)).toBe('—')
    expect(cellTextForAutofit(12)).toBe('12')
  })

  it('honors min/max and grows with long content', () => {
    const short = estimateColumnWidthPx('id', [{ id: '1' }, { id: '2' }])
    const long = estimateColumnWidthPx('id', [{ id: 'x'.repeat(100) }])
    expect(short).toBeGreaterThanOrEqual(AUTOFIT_MIN_PX)
    expect(long).toBeLessThanOrEqual(AUTOFIT_MAX_PX)
    expect(long).toBeGreaterThan(short)
  })

  it('samples only first N rows', () => {
    const rows = Array.from({ length: 50 }, (_, i) => ({
      c: i === 0 ? 'short' : i === 40 ? 'Y'.repeat(200) : 'mid',
    }))
    const withSample = estimateColumnWidthPx('c', rows, { sampleRows: 10 })
    const withLate = estimateColumnWidthPx('c', rows, { sampleRows: 50 })
    expect(withLate).toBeGreaterThan(withSample)
  })

  it('estimates all columns', () => {
    const widths = estimateAllColumnWidths(
      ['a', 'b'],
      [
        { a: 'hi', b: '你好世界很长很长' },
        { a: 'x', b: '短' },
      ],
    )
    expect(Object.keys(widths)).toEqual(['a', 'b'])
    expect(widths.b!).toBeGreaterThan(widths.a!)
  })
})
