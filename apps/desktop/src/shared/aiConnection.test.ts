import { describe, expect, it } from 'vitest'
import {
  aiConnectionHint,
  resolveAiConnectionId,
  resolveAiDatabaseName,
  tableNamesForConnection,
} from './aiConnection'
import type { ConnectionPublic, SchemaNode } from './types'

const conn = (id: string, name: string): ConnectionPublic =>
  ({
    id,
    name,
    dialect: 'sqlite',
    readOnly: false,
  }) as ConnectionPublic

describe('aiConnection', () => {
  it('prefers tab bind over activeConnectionId', () => {
    expect(resolveAiConnectionId({ connectionId: 'tab-a' }, 'tree-b')).toBe('tab-a')
    expect(resolveAiConnectionId({ connectionId: null }, 'tree-b')).toBe('tree-b')
    expect(resolveAiConnectionId(null, null)).toBeNull()
  })

  it('reads databaseName from tab or browse meta', () => {
    expect(resolveAiDatabaseName({ databaseName: 'retail' })).toBe('retail')
    expect(
      resolveAiDatabaseName({
        browse: { connectionId: 'c', tableName: 't', page: 1, pageSize: 100, databaseName: 'db1' },
      }),
    ).toBe('db1')
  })

  it('lists tables only for the resolved connection', () => {
    const schema: SchemaNode[] = [
      {
        id: 'c1',
        kind: 'connection',
        name: 'A',
        displayName: 'A',
        connectionId: 'c1',
        children: [
          {
            id: 'c1:t',
            kind: 'table',
            name: 'customers',
            displayName: 'customers',
            tableName: 'customers',
            connectionId: 'c1',
          },
        ],
      },
      {
        id: 'c2',
        kind: 'connection',
        name: 'B',
        displayName: 'B',
        connectionId: 'c2',
        children: [
          {
            id: 'c2:t',
            kind: 'table',
            name: 'orders',
            displayName: 'orders',
            tableName: 'orders',
            connectionId: 'c2',
          },
        ],
      },
    ]
    expect(tableNamesForConnection(schema, 'c1')).toEqual(['customers'])
    expect(tableNamesForConnection(schema, 'c2')).toEqual(['orders'])
    expect(tableNamesForConnection(schema, null)).toEqual([])
  })

  it('formats hint', () => {
    expect(aiConnectionHint(conn('c1', '示例业务库'), { fromTabBind: true })).toContain('当前标签')
    expect(aiConnectionHint(null, { missing: true })).toContain('未绑定')
    expect(
      aiConnectionHint(conn('c1', '测试数据库'), {
        fromTabBind: true,
        databaseName: 'snowy-cloud',
      }),
    ).toContain('snowy-cloud')
  })
})
