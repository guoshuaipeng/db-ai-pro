import { describe, expect, it } from 'vitest'
import {
  columnHeadersCopiedToast,
  formatColumnHeaders,
  visibleResultColumns,
} from './resultColumnHeaders'

describe('resultColumnHeaders', () => {
  it('drops __rowid__', () => {
    expect(visibleResultColumns(['__rowid__', 'id', 'name'])).toEqual(['id', 'name'])
  })

  it('formats tsv csv comma newline', () => {
    const cols = ['id', 'order date']
    expect(formatColumnHeaders(cols, 'tsv')).toBe('id\torder date')
    expect(formatColumnHeaders(cols, 'csv')).toBe('id,order date')
    expect(formatColumnHeaders(cols, 'comma')).toBe('id, order date')
    expect(formatColumnHeaders(cols, 'newline')).toBe('id\norder date')
  })

  it('quotes csv fields with commas', () => {
    expect(formatColumnHeaders(['a,b', 'c'], 'csv')).toBe('"a,b",c')
  })

  it('toast', () => {
    expect(columnHeadersCopiedToast(3)).toBe('已复制 3 个列名')
  })
})
