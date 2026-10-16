import type { Connection } from 'mysql2/promise'
import type { RowDataPacket } from 'mysql2'
import type { Client } from 'pg'
import type Database from 'better-sqlite3'
import type { ConnectionPool } from 'mssql'
import { composeCreateTable, ddlLabelFor, type TableColumnInfo, type TableIndexInfo, type TableStructure } from '@shared/tableStructure'
import { quoteIdent, identStyle } from '@shared/sql'
import type { Dialect } from '@shared/types'
import type { SqlTarget } from './target'

function q(dialect: Dialect, name: string): string {
  return quoteIdent(name, identStyle(dialect))
}

function str(value: unknown): string {
  if (value == null) return ''
  return String(value)
}

export function inspectSqliteTable(
  db: Database.Database,
  target: SqlTarget,
  tableName: string,
): TableStructure {
  const info = db.prepare(`PRAGMA table_info(${q('sqlite', tableName)})`).all() as Array<{
    cid: number
    name: string
    type: string
    notnull: number
    dflt_value: string | null
    pk: number
  }>
  if (!info.length) throw new Error(`找不到表 ${tableName}`)

  const columns: TableColumnInfo[] = info.map((row) => ({
    name: row.name,
    dataType: row.type || 'TEXT',
    nullable: row.notnull === 0 && row.pk === 0,
    defaultValue: row.dflt_value,
    primaryKey: row.pk > 0,
    ordinal: row.cid,
  }))

  const indexList = db.prepare(`PRAGMA index_list(${q('sqlite', tableName)})`).all() as Array<{
    name: string
    unique: number
    origin: string
  }>
  const indexes: TableIndexInfo[] = indexList.map((item) => {
    const cols = db.prepare(`PRAGMA index_info(${q('sqlite', item.name)})`).all() as Array<{ name: string }>
    return {
      name: item.name,
      unique: item.unique === 1,
      primary: item.origin === 'pk',
      columns: cols.map((col) => col.name).filter(Boolean),
    }
  })

  const ddlRow = db
    .prepare(`SELECT sql FROM sqlite_master WHERE type IN ('table','view') AND name = ?`)
    .get(tableName) as { sql: string | null } | undefined

  return {
    connectionId: target.id,
    tableName,
    dialect: 'sqlite',
    columns,
    indexes,
    ddl: ddlRow?.sql?.trim() || composeCreateTable(tableName, columns, (n) => q('sqlite', n)),
    ddlLabel: ddlLabelFor('sqlite'),
  }
}

export async function inspectMysqlTable(
  conn: Connection,
  target: SqlTarget,
  tableName: string,
): Promise<TableStructure> {
  const dialect: Dialect = target.dialect === 'mariadb' ? 'mariadb' : 'mysql'
  const [colRows] = await conn.query<RowDataPacket[]>(
    `SELECT COLUMN_NAME AS name, COLUMN_TYPE AS data_type, IS_NULLABLE AS is_nullable,
            COLUMN_DEFAULT AS column_default, COLUMN_KEY AS column_key, ORDINAL_POSITION AS ordinal
     FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ?
     ORDER BY ORDINAL_POSITION`,
    [tableName],
  )
  if (!colRows.length) throw new Error(`找不到表 ${tableName}`)

  const columns: TableColumnInfo[] = colRows.map((row) => ({
    name: str(row.name),
    dataType: str(row.data_type) || 'TEXT',
    nullable: String(row.is_nullable).toUpperCase() === 'YES',
    defaultValue: row.column_default == null ? null : str(row.column_default),
    primaryKey: String(row.column_key).toUpperCase() === 'PRI',
    ordinal: Number(row.ordinal) || 0,
  }))

  const [idxRows] = await conn.query<RowDataPacket[]>(
    `SELECT INDEX_NAME AS name, NON_UNIQUE AS non_unique, COLUMN_NAME AS column_name, SEQ_IN_INDEX AS seq
     FROM information_schema.STATISTICS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ?
     ORDER BY INDEX_NAME, SEQ_IN_INDEX`,
    [tableName],
  )
  const indexMap = new Map<string, TableIndexInfo>()
  for (const row of idxRows) {
    const name = str(row.name)
    const existing = indexMap.get(name) ?? {
      name,
      unique: Number(row.non_unique) === 0,
      primary: name.toUpperCase() === 'PRIMARY',
      columns: [],
    }
    existing.columns.push(str(row.column_name))
    indexMap.set(name, existing)
  }

  let ddl: string | null = null
  try {
    const [createRows] = await conn.query<RowDataPacket[]>(`SHOW CREATE TABLE ${q(dialect, tableName)}`)
    const first = createRows[0] as Record<string, unknown> | undefined
    if (first) {
      ddl = str(first['Create Table'] ?? first['Create View'] ?? Object.values(first)[1] ?? '') || null
    }
  } catch {
    ddl = composeCreateTable(tableName, columns, (n) => q(dialect, n))
  }

  return {
    connectionId: target.id,
    tableName,
    dialect,
    columns,
    indexes: [...indexMap.values()],
    ddl,
    ddlLabel: ddlLabelFor(dialect),
  }
}

export async function inspectPostgresTable(
  client: Client,
  target: SqlTarget,
  tableName: string,
): Promise<TableStructure> {
  const colResult = await client.query<{
    name: string
    data_type: string
    is_nullable: string
    column_default: string | null
    ordinal: number
  }>(
    `SELECT c.column_name AS name,
            CASE
              WHEN c.character_maximum_length IS NOT NULL
                THEN c.data_type || '(' || c.character_maximum_length || ')'
              ELSE c.data_type
            END AS data_type,
            c.is_nullable,
            c.column_default,
            c.ordinal_position AS ordinal
     FROM information_schema.columns c
     WHERE c.table_schema = 'public' AND c.table_name = $1
     ORDER BY c.ordinal_position`,
    [tableName],
  )
  if (!colResult.rows.length) throw new Error(`找不到表 ${tableName}`)

  const pkResult = await client.query<{ column_name: string }>(
    `SELECT kcu.column_name
     FROM information_schema.table_constraints tc
     JOIN information_schema.key_column_usage kcu
       ON tc.constraint_name = kcu.constraint_name
      AND tc.table_schema = kcu.table_schema
     WHERE tc.table_schema = 'public'
       AND tc.table_name = $1
       AND tc.constraint_type = 'PRIMARY KEY'
     ORDER BY kcu.ordinal_position`,
    [tableName],
  )
  const pk = new Set(pkResult.rows.map((row) => row.column_name))

  const columns: TableColumnInfo[] = colResult.rows.map((row) => ({
    name: row.name,
    dataType: row.data_type || 'text',
    nullable: row.is_nullable === 'YES',
    defaultValue: row.column_default,
    primaryKey: pk.has(row.name),
    ordinal: Number(row.ordinal) || 0,
  }))

  const idxResult = await client.query<{
    indexname: string
    indexdef: string
  }>(`SELECT indexname, indexdef FROM pg_indexes WHERE schemaname = 'public' AND tablename = $1 ORDER BY indexname`, [
    tableName,
  ])
  const indexes: TableIndexInfo[] = idxResult.rows.map((row) => {
    const unique = /\bUNIQUE\b/i.test(row.indexdef)
    const primary = /\bPRIMARY KEY\b/i.test(row.indexdef)
    const match = row.indexdef.match(/\(([^)]+)\)\s*$/)
    const columnsList = match
      ? match[1].split(',').map((part) => part.trim().replace(/^"|"$/g, ''))
      : []
    return { name: row.indexname, unique: unique || primary, primary, columns: columnsList }
  })

  return {
    connectionId: target.id,
    tableName,
    dialect: 'postgresql',
    columns,
    indexes,
    ddl: composeCreateTable(tableName, columns, (n) => q('postgresql', n)),
    ddlLabel: ddlLabelFor('postgresql'),
  }
}

export async function inspectMssqlTable(
  pool: ConnectionPool,
  target: SqlTarget,
  tableName: string,
): Promise<TableStructure> {
  const colResult = await pool
    .request()
    .input('table', tableName)
    .query(`
      SELECT
        c.name AS name,
        ty.name AS data_type,
        c.is_nullable AS is_nullable,
        c.column_id AS ordinal,
        dc.definition AS column_default,
        CASE WHEN pk.column_id IS NULL THEN 0 ELSE 1 END AS is_pk
      FROM sys.tables t
      INNER JOIN sys.columns c ON c.object_id = t.object_id
      INNER JOIN sys.types ty ON ty.user_type_id = c.user_type_id
      LEFT JOIN sys.default_constraints dc ON dc.parent_object_id = t.object_id AND dc.parent_column_id = c.column_id
      LEFT JOIN (
        SELECT ic.object_id, ic.column_id
        FROM sys.index_columns ic
        INNER JOIN sys.indexes i ON i.object_id = ic.object_id AND i.index_id = ic.index_id
        WHERE i.is_primary_key = 1
      ) pk ON pk.object_id = t.object_id AND pk.column_id = c.column_id
      WHERE t.is_ms_shipped = 0 AND t.name = @table
      ORDER BY c.column_id
    `)

  if (!colResult.recordset.length) throw new Error(`找不到表 ${tableName}`)

  const columns: TableColumnInfo[] = colResult.recordset.map((row) => ({
    name: str(row.name),
    dataType: str(row.data_type) || 'nvarchar',
    nullable: Boolean(row.is_nullable),
    defaultValue: row.column_default == null ? null : str(row.column_default),
    primaryKey: Number(row.is_pk) === 1,
    ordinal: Number(row.ordinal) || 0,
  }))

  const idxResult = await pool
    .request()
    .input('table', tableName)
    .query(`
      SELECT
        i.name AS name,
        i.is_unique AS is_unique,
        i.is_primary_key AS is_primary,
        c.name AS column_name,
        ic.key_ordinal AS seq
      FROM sys.tables t
      INNER JOIN sys.indexes i ON i.object_id = t.object_id
      INNER JOIN sys.index_columns ic ON ic.object_id = i.object_id AND ic.index_id = i.index_id
      INNER JOIN sys.columns c ON c.object_id = t.object_id AND c.column_id = ic.column_id
      WHERE t.is_ms_shipped = 0 AND t.name = @table AND i.name IS NOT NULL
      ORDER BY i.name, ic.key_ordinal
    `)

  const indexMap = new Map<string, TableIndexInfo>()
  for (const row of idxResult.recordset) {
    const name = str(row.name)
    const existing = indexMap.get(name) ?? {
      name,
      unique: Boolean(row.is_unique) || Boolean(row.is_primary),
      primary: Boolean(row.is_primary),
      columns: [],
    }
    existing.columns.push(str(row.column_name))
    indexMap.set(name, existing)
  }

  return {
    connectionId: target.id,
    tableName,
    dialect: 'sqlserver',
    columns,
    indexes: [...indexMap.values()],
    ddl: composeCreateTable(tableName, columns, (n) => q('sqlserver', n)),
    ddlLabel: ddlLabelFor('sqlserver'),
  }
}
