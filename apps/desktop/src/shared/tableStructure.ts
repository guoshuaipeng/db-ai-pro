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


export function filterStructureColumns(
  columns: readonly TableColumnInfo[],
  query: string,
): TableColumnInfo[] {
  const q = query.trim().toLowerCase()
  if (!q) return columns.slice()
  return columns.filter((column) => {
    const hay = `${column.name} ${column.dataType} ${column.defaultValue ?? ''}`.toLowerCase()
    return hay.includes(q)
  })
}

export type StructureDdlSummary = {
  isEmpty: boolean
  lineCount: number
  statusLabel: string
}

export function summarizeStructureDdl(ddl: string | null | undefined): StructureDdlSummary {
  const text = (ddl ?? '').replace(/\r\n/g, '\n').trim()
  if (!text || text === '（没有可用的 DDL）') {
    return { isEmpty: true, lineCount: 0, statusLabel: '没有可用的 DDL' }
  }
  const lineCount = text.split('\n').filter((line) => line.trim().length > 0).length
  return {
    isEmpty: false,
    lineCount,
    statusLabel: `${lineCount.toLocaleString('zh-CN')} 行 DDL`,
  }
}

export function structureColumnsEmptyBody(hasFilter: boolean): string {
  if (hasFilter) return '没有匹配的列。试试更短的关键字，或清除筛选。'
  return '当前表没有列信息（或驱动未返回）。'
}

export function structureIndexesEmptyBody(): string {
  return '当前驱动未返回索引，或该表没有索引。'
}

export function structureRelationsEmptyBody(): string {
  return '没有外键 / 引用关系（或当前驱动未返回）。'
}

export function structureDdlEmptyBody(): string {
  return '引擎没有返回可用的 CREATE 文本。可切换到「列」查看字段，或在支持 SHOW CREATE 的库上重试。'
}

export function structureDdlCopiedToast(): string {
  return '已复制 DDL'
}

export function structureDdlAppliedToast(): string {
  return 'DDL 已写入编辑器'
}

export function structureTabBadge(
  tab: 'columns' | 'indexes' | 'relations' | 'ddl',
  structure: Pick<TableStructure, 'columns' | 'indexes' | 'foreignKeys' | 'ddl'>,
): string {
  if (tab === 'columns') return String(structure.columns.length)
  if (tab === 'indexes') return String(structure.indexes.length)
  if (tab === 'relations') return String(structure.foreignKeys?.length ?? 0)
  const summary = summarizeStructureDdl(structure.ddl)
  return summary.isEmpty ? '0' : String(summary.lineCount)
}
