import type { Dialect } from './types'

export type TableColumnInfo = {
  name: string
  dataType: string
  nullable: boolean
  defaultValue: string | null
  primaryKey: boolean
  ordinal: number
}

export type TableIndexInfo = {
  name: string
  unique: boolean
  primary: boolean
  columns: string[]
}

export type TableForeignKeyInfo = {
  name: string
  columns: string[]
  refTable: string
  refColumns: string[]
  onUpdate?: string
  onDelete?: string
}

export type TableStructure = {
  connectionId: string
  tableName: string
  dialect: Dialect
  columns: TableColumnInfo[]
  indexes: TableIndexInfo[]
  foreignKeys: TableForeignKeyInfo[]
  ddl: string | null
  ddlLabel: string
}

/** Human-readable FK line for lists / empty-state tests. */
export function formatForeignKeyGlance(fk: TableForeignKeyInfo): string {
  const local = fk.columns.join(', ') || '?'
  const remote = fk.refColumns.join(', ') || '?'
  return `${local} → ${fk.refTable}(${remote})`
}

export function ddlLabelFor(dialect: Dialect): string {
  if (dialect === 'sqlite') return 'sqlite_master'
  if (dialect === 'mysql' || dialect === 'mariadb') return 'SHOW CREATE TABLE'
  if (dialect === 'postgresql') return 'CREATE (重建)'
  if (dialect === 'sqlserver') return 'CREATE (重建)'
  return 'DDL'
}

/** Compose a readable CREATE TABLE when the engine has no SHOW CREATE. */
export function composeCreateTable(
  tableName: string,
  columns: TableColumnInfo[],
  quote: (name: string) => string,
): string {
  const lines = columns.map((column) => {
    const parts = [`  ${quote(column.name)} ${column.dataType || 'TEXT'}`]
    if (column.primaryKey) parts.push('PRIMARY KEY')
    if (!column.nullable && !column.primaryKey) parts.push('NOT NULL')
    if (column.defaultValue != null && column.defaultValue !== '') {
      parts.push(`DEFAULT ${column.defaultValue}`)
    }
    return parts.join(' ')
  })
  return `CREATE TABLE ${quote(tableName)} (\n${lines.join(',\n')}\n);`
}
