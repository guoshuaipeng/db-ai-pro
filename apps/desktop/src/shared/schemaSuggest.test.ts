import { describe, expect, it } from 'vitest'
import {
  detectSqlSuggestContext,
  filterSuggestions,
  schemaSuggestObjectCount,
  suggestEditorOverlayBody,
  suggestKindLabel,
  suggestionsFromSchema,
} from './schemaSuggest'
import type { SchemaNode } from './types'

const tree: SchemaNode[] = [
  {
    id: 'c1',
    kind: 'connection',
    name: 'demo',
    displayName: 'demo',
    connectionId: 'c1',
    children: [
      {
        id: 'c1:db',
        kind: 'database',
        name: 'retail',
        displayName: 'retail',
        connectionId: 'c1',
        children: [
          {
            id: 'c1:table:customers',
            kind: 'table',
            name: 'customers',
            displayName: '客户',
            tableName: 'customers',
            connectionId: 'c1',
            children: [
              {
                id: 'c1:column:customers:name',
                kind: 'column',
                name: 'name',
                displayName: 'name',
                dataType: 'TEXT',
                tableName: 'customers',
                connectionId: 'c1',
              },
            ],
          },
        ],
      },
    ],
  },
]

describe('suggestionsFromSchema', () => {
  it('lists tables and columns for the active connection', () => {
    const items = suggestionsFromSchema(tree, 'c1')
    expect(items.some((item) => item.kind === 'table' && item.label === 'customers')).toBe(true)
    expect(items.some((item) => item.kind === 'column' && item.label === 'name')).toBe(true)
    expect(items.some((item) => item.kind === 'keyword' && item.label === 'SELECT')).toBe(true)
    expect(items.find((item) => item.label === 'customers')?.detail).toContain('表')
    expect(schemaSuggestObjectCount(items)).toBeGreaterThan(0)
  })
})

describe('filterSuggestions', () => {
  it('ranks prefix matches first', () => {
    const items = suggestionsFromSchema(tree, 'c1')
    const filtered = filterSuggestions(items, 'cus')
    expect(filtered[0]?.label).toBe('customers')
  })

  it('boosts tables after FROM', () => {
    const items = suggestionsFromSchema(tree, 'c1')
    const filtered = filterSuggestions(items, '', 40, 'table')
    expect(filtered[0]?.kind).toBe('table')
  })
})

describe('detectSqlSuggestContext', () => {
  it('detects table vs column clauses', () => {
    expect(detectSqlSuggestContext('SELECT * FROM ')).toBe('table')
    expect(detectSqlSuggestContext('SELECT ')).toBe('column')
    expect(detectSqlSuggestContext('WHERE ')).toBe('column')
    expect(suggestKindLabel('keyword')).toBe('关键字')
    expect(suggestEditorOverlayBody(false)).toContain('对象树')
    expect(suggestEditorOverlayBody(true)).toContain('Ctrl+Space')
  })
})
