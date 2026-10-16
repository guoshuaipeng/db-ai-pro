import { describe, expect, it } from 'vitest'
import { tablesFromDescribe } from '@shared/describeParse'
import { searchRelevantTables, schemaForTables } from '@shared/tableCatalog'
import { runTool } from './tools'

const tables = tablesFromDescribe(`customers (id INTEGER, name TEXT, region TEXT, status TEXT)
orders (id INTEGER, customer_id INTEGER, total_cents INTEGER, status TEXT, placed_at TEXT)
products (id INTEGER, category TEXT, name TEXT)
`)

describe('table catalog tools', () => {
  it('ranks customer prompts toward customers', () => {
    const hits = searchRelevantTables(tables, '华东的活跃客户')
    expect(hits[0]?.name).toBe('customers')
  })

  it('returns schema for selected tables', () => {
    const text = schemaForTables(tables, ['orders'])
    expect(text).toContain('orders')
    expect(text).toContain('total_cents')
  })

  it('runs search_relevant_tables tool', () => {
    const result = runTool(tables, {
      name: 'search_relevant_tables',
      arguments: { prompt: '各品类销量' },
    })
    expect(result.ok).toBe(true)
    expect(result.detail).toMatch(/products|orders/)
  })

  it('runs get_table_schema tool', () => {
    const result = runTool(tables, {
      name: 'get_table_schema',
      arguments: { tables: ['customers'] },
    })
    expect(result.ok).toBe(true)
    expect(result.detail).toContain('region')
  })
})

describe('tablesFromDescribe', () => {
  it('parses describe lines', () => {
    expect(tables).toHaveLength(3)
    expect(tables[0]?.columns[0]?.name).toBe('id')
  })
})
