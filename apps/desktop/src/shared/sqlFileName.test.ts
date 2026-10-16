import { describe, expect, it } from 'vitest'
import { suggestedSqlFileName, tabTitleFromSqlPath } from './sqlFileName'

describe('suggestedSqlFileName', () => {
  it('uses query.sql for generic tabs', () => {
    expect(suggestedSqlFileName('查询 3')).toBe('query.sql')
    expect(suggestedSqlFileName('• 查询')).toBe('query.sql')
  })

  it('keeps meaningful titles', () => {
    expect(suggestedSqlFileName('周报统计')).toBe('周报统计.sql')
  })
})

describe('tabTitleFromSqlPath', () => {
  it('strips directory and extension', () => {
    expect(tabTitleFromSqlPath('E:\\work\\orders.sql')).toBe('orders')
  })
})
