import { describe, expect, it } from 'vitest'
import {
  PAGE_SIZES,
  buildBrowseSql,
  buildCountSql,
  qualifyBrowseTable,
  canNextPage,
  canPrevPage,
  clampBrowsePage,
  formatPageInfo,
  normalizeBrowseState,
  normalizePageSize,
  pageCount,
  pageOffset,
  parseCountValue,
} from './tablePaging'

describe('tablePaging', () => {
  it('normalizes page sizes to 100/500/1000', () => {
    expect(PAGE_SIZES).toEqual([100, 500, 1000])
    expect(normalizePageSize(500)).toBe(500)
    expect(normalizePageSize(999)).toBe(100)
    expect(normalizePageSize('1000')).toBe(1000)
  })

  it('builds LIMIT/OFFSET for sqlite/mysql/pg', () => {
    expect(buildBrowseSql('sqlite', 'orders', 0, 100)).toBe(
      'SELECT rowid AS __rowid__, *\nFROM "orders"\nLIMIT 100 OFFSET 0;',
    )
    expect(buildBrowseSql('mysql', 'orders', 2, 500)).toBe(
      'SELECT *\nFROM `orders`\nLIMIT 500 OFFSET 1000;',
    )
    expect(buildBrowseSql('postgresql', 't', 1, 1000)).toBe(
      'SELECT *\nFROM "t"\nLIMIT 1000 OFFSET 1000;',
    )
  })

  it('qualifies MySQL/MSSQL browse with databaseName', () => {
    expect(qualifyBrowseTable('mysql', 'orders', 'shop')).toBe('`shop`.`orders`')
    expect(buildBrowseSql('mysql', 'orders', 0, 100, 'shop')).toBe(
      'SELECT *\nFROM `shop`.`orders`\nLIMIT 100 OFFSET 0;',
    )
    expect(buildBrowseSql('sqlserver', 't', 0, 100, 'app')).toBe(
      'SELECT *\nFROM "app".."t"\nORDER BY (SELECT NULL)\nOFFSET 0 ROWS FETCH NEXT 100 ROWS ONLY;',
    )
    expect(buildCountSql('mariadb', 't', 'db1')).toBe('SELECT COUNT(*) AS __cnt__\nFROM `db1`.`t`;')
    // PG ignores databaseName in SQL (session-level DB)
    expect(qualifyBrowseTable('postgresql', 't', 'other')).toBe('"t"')
  })

  it('builds OFFSET/FETCH for SQL Server with ORDER BY', () => {
    expect(buildBrowseSql('sqlserver', 'dbo.t', 1, 100)).toBe(
      'SELECT *\nFROM "dbo.t"\nORDER BY (SELECT NULL)\nOFFSET 100 ROWS FETCH NEXT 100 ROWS ONLY;',
    )
  })

  it('builds COUNT and parses __cnt__', () => {
    expect(buildCountSql('mysql', 'a`b')).toBe('SELECT COUNT(*) AS __cnt__\nFROM `a``b`;')
    expect(parseCountValue({ __cnt__: 42 })).toBe(42)
    expect(parseCountValue({ cnt: '7' })).toBe(7)
    expect(parseCountValue(null)).toBeNull()
  })

  it('formats page info and clamps', () => {
    expect(pageOffset(2, 100)).toBe(200)
    expect(pageCount(250, 100)).toBe(3)
    expect(pageCount(0, 100)).toBe(1)
    expect(formatPageInfo({ connectionId: 'c', tableName: 't', page: 0, pageSize: 100, totalRows: 250 })).toBe(
      '第 1 / 3 页 · 共 250 行 · 100/页',
    )
    const clamped = clampBrowsePage({
      connectionId: 'c',
      tableName: 't',
      page: 99,
      pageSize: 100,
      totalRows: 250,
    })
    expect(clamped.page).toBe(2)
    expect(canPrevPage({ connectionId: 'c', tableName: 't', page: 1, pageSize: 100 })).toBe(true)
    expect(canNextPage({ connectionId: 'c', tableName: 't', page: 2, pageSize: 100, totalRows: 250 })).toBe(
      false,
    )
  })

  it('normalizes browse state from persistence', () => {
    expect(
      normalizeBrowseState({
        connectionId: 'c1',
        tableName: 'orders',
        page: 1.9,
        pageSize: 500,
        totalRows: 10,
      }),
    ).toEqual({
      connectionId: 'c1',
      tableName: 'orders',
      page: 1,
      pageSize: 500,
      totalRows: 10,
    })
    expect(normalizeBrowseState({ connectionId: 'c1' })).toBeUndefined()
  })
})
