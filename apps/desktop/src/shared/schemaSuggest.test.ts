import { describe, expect, it } from 'vitest'
import { filterSuggestions, suggestionsFromSchema } from './schemaSuggest'
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
  })
})

describe('filterSuggestions', () => {
  it('ranks prefix matches first', () => {
    const items = suggestionsFromSchema(tree, 'c1')
    const filtered = filterSuggestions(items, 'cus')
    expect(filtered[0]?.label).toBe('customers')
  })
})
