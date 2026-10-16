import { describe, expect, it } from 'vitest'
import { draftLocalAnswer, INITIAL_TABS } from '@shared/session'
import {
  changesSchema,
  extractSql,
  identStyle,
  parseBlocks,
  quoteIdent,
  quoteIdentIfNeeded,
  selectAll,
  splitSql,
  statementTitle,
} from '@shared/sql'
import { filterNodes } from '@shared/tree'
import type { SchemaNode } from '@shared/types'

describe('splitSql', () => {
  it('keeps semicolons inside strings and comments', () => {
    const sql = "SELECT ';'; -- tail;\nSELECT 1; /* block; */ SELECT 2"
    expect(splitSql(sql)).toEqual(["SELECT ';'", "-- tail;\nSELECT 1", '/* block; */ SELECT 2'])
  })

  it('returns the whole script when there is no semicolon', () => {
    expect(splitSql('SELECT 1')).toEqual(['SELECT 1'])
  })

  it('ignores empty statements', () => {
    expect(splitSql(' ;  ; SELECT 1; ')).toEqual(['SELECT 1'])
  })
})

describe('statement titles and sql fences', () => {
  it('reads a leading comment as the result title', () => {
    expect(statementTitle('-- 各地区金额\nSELECT 1;', 0)).toBe('各地区金额')
    expect(statementTitle('SELECT 1', 2)).toBe('结果 3')
  })

  it('extracts the last closed sql fence while streaming an open one', () => {
    const text = '说明\n```sql\nSELECT 1;\n```\n继续\n```sql\nSELECT 2'
    const blocks = parseBlocks(text)
    expect(blocks.map((block) => block.type)).toEqual(['text', 'sql', 'text', 'sql'])
    expect(extractSql(text)).toBe('SELECT 1;')
    expect(blocks[3]).toMatchObject({ type: 'sql', closed: false })
  })
})

describe('workspace seeds', () => {
  it('gives every restored query at least one statement', () => {
    expect(INITIAL_TABS.length).toBeGreaterThanOrEqual(7)
    for (const tab of INITIAL_TABS) {
      expect(tab.title.trim().length).toBeGreaterThan(1)
      expect(splitSql(tab.sql).length).toBeGreaterThan(0)
    }
    expect(splitSql(INITIAL_TABS[6].sql)).toHaveLength(3)
  })

  it('routes local answers to a sql fence', () => {
    const answer = draftLocalAnswer('近 90 天金额最高的订单')
    expect(answer).toContain('大额订单')
    expect(extractSql(answer)).toMatch(/total_cents >= 50000/)
  })
})

describe('identifiers', () => {
  it('quotes mysql tables with backticks and the others with double quotes', () => {
    expect(identStyle('mysql')).toBe('mysql')
    expect(identStyle('mariadb')).toBe('mysql')
    expect(identStyle('postgresql')).toBe('ansi')
    expect(quoteIdent('a`b', 'mysql')).toBe('`a``b`')
    expect(quoteIdent('a"b')).toBe('"a""b"')
    expect(selectAll('orders', 'mysql')).toBe('SELECT *\nFROM `orders`\nLIMIT 200;')
  })

  it('quotes identifiers only when needed', () => {
    expect(quoteIdentIfNeeded('orders', 'mysql')).toBe('orders')
    expect(quoteIdentIfNeeded('order detail', 'mysql')).toBe('`order detail`')
    expect(quoteIdentIfNeeded('a"b', 'postgresql')).toBe('"a""b"')
  })

  it('notices statements that change the object tree', () => {
    expect(changesSchema('-- keep\nCREATE TABLE t (id int);')).toBe(true)
    expect(changesSchema('SELECT create_time FROM orders')).toBe(false)
  })
})

describe('filterNodes', () => {
  const tree: SchemaNode[] = [
    {
      id: 'c1',
      kind: 'connection',
      name: 'retail',
      displayName: '示例业务库',
      children: [
        {
          id: 'db',
          kind: 'database',
          name: 'retail.db',
          displayName: 'retail.db',
          children: [
            { id: 't1', kind: 'table', name: 'customers', displayName: '客户' },
            { id: 't2', kind: 'table', name: 'orders', displayName: '订单' },
          ],
        },
      ],
    },
  ]

  it('keeps the full branch when the connection matches', () => {
    const [hit] = filterNodes(tree, '示例')
    expect(hit.children?.[0].children).toHaveLength(2)
  })

  it('keeps ancestors when only a table matches', () => {
    const [hit] = filterNodes(tree, '订单')
    expect(hit.children?.[0].children?.map((node) => node.name)).toEqual(['orders'])
  })

  it('returns nothing for an unknown object', () => {
    expect(filterNodes(tree, '不存在')).toEqual([])
  })
})
