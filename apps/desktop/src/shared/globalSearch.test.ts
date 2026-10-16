import { describe, expect, it } from 'vitest'
import { buildSchemaObjectIndex, searchGlobalObjects } from './globalSearch'
import type { SchemaNode, SqlFavorite } from './types'

const schema: SchemaNode[] = [
  {
    id: 'c1',
    kind: 'connection',
    name: 'local',
    displayName: '本地库',
    connectionId: 'c1',
    children: [
      {
        id: 't1',
        kind: 'table',
        name: 'orders',
        displayName: 'orders',
        tableName: 'orders',
        connectionId: 'c1',
        children: [
          { id: 'col1', kind: 'column', name: 'total_cents', displayName: 'total_cents', dataType: 'INTEGER' },
          { id: 'col2', kind: 'column', name: 'status', displayName: 'status', dataType: 'TEXT' },
        ],
      },
      {
        id: 't2',
        kind: 'table',
        name: 'customers',
        displayName: 'customers',
        tableName: 'customers',
        connectionId: 'c1',
      },
    ],
  },
]

const favorites: SqlFavorite[] = [
  {
    id: 'f1',
    name: '高价值订单',
    sql: 'SELECT * FROM {{table}} LIMIT {{limit}}',
    connectionId: null,
    folderId: null,
    createdAt: 't',
    updatedAt: 't',
  },
]

describe('globalSearch', () => {
  it('indexes tables and columns for a connection', () => {
    const index = buildSchemaObjectIndex(schema, 'c1')
    expect(index.tables.map((t) => t.tableName).sort()).toEqual(['customers', 'orders'])
    expect(index.columns.some((c) => c.columnName === 'total_cents')).toBe(true)
  })

  it('fuzzy finds table, column, and favorite', () => {
    const index = buildSchemaObjectIndex(schema, 'c1')
    const hits = searchGlobalObjects('ord', index, favorites, { connectionId: 'c1' })
    expect(hits.some((h) => h.kind === 'schema-table' && h.tableName === 'orders')).toBe(true)
    const colHits = searchGlobalObjects('total', index, favorites, { connectionId: 'c1' })
    expect(colHits.some((h) => h.kind === 'schema-column' && h.columnName === 'total_cents')).toBe(true)
    const favHits = searchGlobalObjects('高价值', index, favorites, { connectionId: 'c1' })
    expect(favHits.some((h) => h.kind === 'favorite')).toBe(true)
  })
})
