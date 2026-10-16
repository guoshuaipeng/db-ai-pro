import type { Dialect, SchemaNode } from './types'
import { tableLabel } from './labels'

export type ColumnSpec = {
  name: string
  dataType: string
}

export type TableSpec = {
  name: string
  columns: ColumnSpec[]
}

export function groupColumns(
  rows: { table_name: string; column_name: string; data_type: string }[],
): TableSpec[] {
  const tables: TableSpec[] = []
  for (const row of rows) {
    let table = tables.find((item) => item.name === row.table_name)
    if (!table) {
      table = { name: row.table_name, columns: [] }
      tables.push(table)
    }
    table.columns.push({ name: row.column_name, dataType: row.data_type })
  }
  return tables
}

export function formatSchemaText(tables: TableSpec[]): string {
  return tables
    .map((table) => {
      const body = table.columns.map((column) => `${column.name} ${column.dataType}`.trim()).join(', ')
      return `${table.name} (${body})`
    })
    .join('\n')
}

export function buildObjectTree(input: {
  connectionId: string
  connectionName: string
  dialect: Dialect
  databaseName: string
  tables: TableSpec[]
}): SchemaNode {
  const { connectionId, connectionName, dialect, databaseName, tables } = input
  const tableNodes: SchemaNode[] = tables.map((table) => ({
    id: `${connectionId}:table:${table.name}`,
    kind: 'table',
    name: table.name,
    displayName: tableLabel(table.name),
    dialect,
    connectionId,
    tableName: table.name,
    children: table.columns.map((column) => ({
      id: `${connectionId}:column:${table.name}:${column.name}`,
      kind: 'column' as const,
      name: column.name,
      displayName: column.name,
      dataType: column.dataType,
      dialect,
      connectionId,
      tableName: table.name,
    })),
  }))

  const databaseChildren: SchemaNode[] =
    tableNodes.length > 0
      ? tableNodes
      : [
          {
            id: `${connectionId}:empty`,
            kind: 'note',
            name: 'empty-schema',
            displayName: '还没有表',
            note: '执行 CREATE TABLE 之后，对象树会在下一次成功的结构语句后刷新。',
            connectionId,
          },
        ]

  return {
    id: connectionId,
    kind: 'connection',
    name: connectionName,
    displayName: connectionName,
    dialect,
    connectionId,
    status: 'ok',
    children: [
      {
        id: `${connectionId}:db`,
        kind: 'database',
        name: databaseName,
        displayName: databaseName,
        dialect,
        connectionId,
        children: databaseChildren,
      },
    ],
  }
}

export function connectionErrorNode(
  connectionId: string,
  name: string,
  dialect: Dialect,
  message: string,
): SchemaNode {
  return {
    id: connectionId,
    kind: 'connection',
    name,
    displayName: name,
    dialect,
    connectionId,
    status: 'error',
    children: [
      {
        id: `${connectionId}:error`,
        kind: 'note',
        name: 'connect-error',
        displayName: '连接失败',
        note: message,
        connectionId,
      },
    ],
  }
}
