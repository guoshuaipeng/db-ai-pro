import { describe, expect, it } from 'vitest'
import { countTreeNodes, filterNodes } from './tree'
import type { SchemaNode } from './types'

const nodes: SchemaNode[] = [
  {
    id: 'c1',
    kind: 'connection',
    name: '华东库',
    displayName: '华东库',
    dialect: 'mysql',
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
            id: 'c1:table:orders',
            kind: 'table',
            name: 'orders',
            displayName: '订单',
            tableName: 'orders',
            connectionId: 'c1',
            children: [
              {
                id: 'c1:column:orders:status',
                kind: 'column',
                name: 'status',
                displayName: 'status',
                dataType: 'varchar',
                tableName: 'orders',
                connectionId: 'c1',
              },
            ],
          },
        ],
      },
    ],
  },
]

describe('filterNodes', () => {
  it('matches table display names and keeps ancestors', () => {
    const filtered = filterNodes(nodes, '订单')
    expect(filtered).toHaveLength(1)
    expect(filtered[0].children?.[0].children?.[0].tableName).toBe('orders')
  })

  it('matches host extras on the connection', () => {
    const filtered = filterNodes(nodes, '10.0.0.8', { c1: { host: '10.0.0.8', database: 'retail' } })
    expect(filtered[0]?.id).toBe('c1')
  })

  it('matches column types', () => {
    const filtered = filterNodes(nodes, 'varchar')
    expect(countTreeNodes(filtered).columns).toBe(1)
  })
})
