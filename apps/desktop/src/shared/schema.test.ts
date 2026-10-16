import { describe, expect, it } from 'vitest'
import { buildObjectTree, connectionErrorNode, groupColumns } from '@shared/schema'

describe('object tree', () => {
  it('nests columns under tables', () => {
    const tree = buildObjectTree({
      connectionId: 'c1',
      connectionName: '订单库',
      dialect: 'postgresql',
      databaseName: 'dataai',
      tables: groupColumns([
        { table_name: 'orders', column_name: 'id', data_type: 'integer' },
        { table_name: 'orders', column_name: 'note', data_type: 'text' },
      ]),
    })
    const table = tree.children?.[0].children?.[0]
    expect(table?.kind).toBe('table')
    expect(table?.children?.map((column) => column.dataType)).toEqual(['integer', 'text'])
    expect(tree.status).toBe('ok')
  })

  it('marks a failed connection without pretending the driver is missing', () => {
    const tree = connectionErrorNode('c1', '订单库', 'mysql', '无法连接：目标端口没有服务在监听。')
    expect(tree.status).toBe('error')
    expect(tree.children?.[0].name).toBe('connect-error')
    expect(tree.children?.[0].note).toContain('没有服务')
  })
})
