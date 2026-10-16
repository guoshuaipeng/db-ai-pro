import { describe, expect, it } from 'vitest'
import {
  filterRecentQueries,
  filterRecentTables,
  formatRecentQueryClipboard,
  formatRecentTableClipboard,
  normalizeRecentItems,
  pushRecentQuery,
  pushRecentTable,
  RECENT_ITEMS_LIMIT,
  recentMenuEmptyBody,
  recentMenuMatchCount,
} from './recentItems'

describe('recentItems', () => {
  it('dedupes and caps tables', () => {
    let list = pushRecentTable([], { connectionId: 'c1', connectionName: 'A', tableName: 't1' })
    list = pushRecentTable(list, { connectionId: 'c1', connectionName: 'A', tableName: 't2' })
    list = pushRecentTable(list, { connectionId: 'c1', connectionName: 'A', tableName: 't1' })
    expect(list.map((r) => r.tableName)).toEqual(['t1', 't2'])
  })

  it('dedupes queries by sql+connection', () => {
    let list = pushRecentQuery([], { connectionId: 'c1', connectionName: 'A', sql: 'SELECT 1' })
    list = pushRecentQuery(list, { connectionId: 'c1', connectionName: 'A', sql: 'SELECT 1' })
    list = pushRecentQuery(list, { connectionId: 'c2', connectionName: 'B', sql: 'SELECT 1' })
    expect(list).toHaveLength(2)
    expect(list[0].connectionId).toBe('c2')
  })

  it('normalizes and respects limit', () => {
    const many = Array.from({ length: RECENT_ITEMS_LIMIT + 5 }, (_, i) => ({
      kind: 'table' as const,
      connectionId: 'c',
      connectionName: 'n',
      tableName: `t${i}`,
      at: '2026-01-01T00:00:00.000Z',
    }))
    const state = normalizeRecentItems({ version: 1, tables: many, queries: [] })
    expect(state.tables).toHaveLength(RECENT_ITEMS_LIMIT)
  })
})


describe('recent menu polish', () => {
  it('filters and formats clipboard', () => {
    const tables = [
      { kind: 'table' as const, connectionId: 'c', connectionName: '华东', tableName: 'orders', at: 't' },
    ]
    const queries = [
      { kind: 'query' as const, connectionId: 'c', connectionName: '华东', sql: 'SELECT 1', at: 't' },
    ]
    expect(filterRecentTables(tables, 'order')).toHaveLength(1)
    expect(filterRecentQueries(queries, 'select')).toHaveLength(1)
    expect(formatRecentTableClipboard(tables[0])).toBe('华东 / orders')
    expect(formatRecentQueryClipboard(queries[0])).toBe('SELECT 1')
    expect(recentMenuEmptyBody('all', true)).toContain('没有匹配')
    expect(recentMenuMatchCount(1, 2)).toBe('1 表 · 2 查询')
  })
})
