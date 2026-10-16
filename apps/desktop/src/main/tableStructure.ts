import type { Connection } from 'mysql2/promise'
import type { RowDataPacket } from 'mysql2'
import type { Client } from 'pg'
import type Database from 'better-sqlite3'
import type { ConnectionPool } from 'mssql'
import { composeCreateTable, ddlLabelFor, type TableColumnInfo, type TableIndexInfo, type TableForeignKeyInfo, type TableStructure } from '@shared/tableStructure'
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

function mergeForeignKeys(
  rows: Array<{ name: string; column: string; refTable: string; refColumn: string; onUpdate?: string; onDelete?: string; seq?: number }>,
): TableForeignKeyInfo[] {
  const map = new Map<string, TableForeignKeyInfo>()
  const ordered = [...rows].sort((a, b) => {
    const byName = a.name.localeCompare(b.name)
    if (byName !== 0) return byName
    return (a.seq ?? 0) - (b.seq ?? 0)
  })
  for (const row of ordered) {
    const key = row.name || `${row.refTable}:${row.column}`
    const existing = map.get(key) ?? {
      name: row.name || key,
      columns: [],
      refTable: row.refTable,
      refColumns: [],
      onUpdate: row.onUpdate,
      onDelete: row.onDelete,
    }
    if (row.column) existing.columns.push(row.column)
    if (row.refColumn) existing.refColumns.push(row.refColumn)
    if (row.onUpdate) existing.onUpdate = row.onUpdate
    if (row.onDelete) existing.onDelete = row.onDelete
    map.set(key, existing)
  }
  return [...map.values()]
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


  const fkRows = db.prepare(`PRAGMA foreign_key_list(${q('sqlite', tableName)})`).all() as Array<{
    id: number
    seq: number
    table: string
    from: string
    to: string
    on_update: string
    on_delete: string
  }>
  const foreignKeys = mergeForeignKeys(
    fkRows.map((row) => ({
      name: `fk_${tableName}_${row.id}`,
      column: row.from,
      refTable: row.table,
      refColumn: row.to,
      onUpdate: row.on_update,
      onDelete: row.on_delete,
      seq: row.seq,
    })),
  )

  return {
    connectionId: target.id,
    tableName,
    dialect: 'sqlite',
    columns,
    indexes,
    foreignKeys,
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


  const [fkRows] = await conn.query<RowDataPacket[]>(
    `SELECT CONSTRAINT_NAME AS name, COLUMN_NAME AS column_name,
            REFERENCED_TABLE_NAME AS ref_table, REFERENCED_COLUMN_NAME AS ref_column,
            ORDINAL_POSITION AS seq
     FROM information_schema.KEY_COLUMN_USAGE
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ?
       AND REFERENCED_TABLE_NAME IS NOT NULL
     ORDER BY CONSTRAINT_NAME, ORDINAL_POSITION`,
    [tableName],
  )
  const foreignKeys = mergeForeignKeys(
    fkRows.map((row) => ({
      name: str(row.name),
      column: str(row.column_name),
      refTable: str(row.ref_table),
      refColumn: str(row.ref_column),
      seq: Number(row.seq) || 0,
    })),
  )

  return {
    connectionId: target.id,
    tableName,
    dialect,
    columns,
    indexes: [...indexMap.values()],
    foreignKeys,
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


  const fkResult = await client.query<{
    name: string
    column_name: string
    ref_table: string
    ref_column: string
    seq: number
  }>(
    `SELECT tc.constraint_name AS name,
            kcu.column_name AS column_name,
            ccu.table_name AS ref_table,
            ccu.column_name AS ref_column,
            kcu.ordinal_position AS seq
     FROM information_schema.table_constraints AS tc
     JOIN information_schema.key_column_usage AS kcu
       ON tc.constraint_name = kcu.constraint_name AND tc.table_schema = kcu.table_schema
     JOIN information_schema.constraint_column_usage AS ccu
       ON ccu.constraint_name = tc.constraint_name AND ccu.table_schema = tc.table_schema
     WHERE tc.constraint_type = 'FOREIGN KEY'
       AND tc.table_schema = 'public'
       AND tc.table_name = $1
     ORDER BY tc.constraint_name, kcu.ordinal_position`,
    [tableName],
  )
  const foreignKeys = mergeForeignKeys(
    fkResult.rows.map((row) => ({
      name: row.name,
      column: row.column_name,
      refTable: row.ref_table,
      refColumn: row.ref_column,
      seq: Number(row.seq) || 0,
    })),
  )

  return {
    connectionId: target.id,
    tableName,
    dialect: 'postgresql',
    columns,
    indexes,
    foreignKeys,
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

  const fkResult = await pool
    .request()
    .input('table', tableName)
    .query(`
      SELECT
        fk.name AS name,
        pc.name AS column_name,
        rt.name AS ref_table,
        rc.name AS ref_column,
        fkc.constraint_column_id AS seq
      FROM sys.foreign_keys fk
      INNER JOIN sys.foreign_key_columns fkc ON fkc.constraint_object_id = fk.object_id
      INNER JOIN sys.tables t ON t.object_id = fk.parent_object_id
      INNER JOIN sys.columns pc ON pc.object_id = fkc.parent_object_id AND pc.column_id = fkc.parent_column_id
      INNER JOIN sys.tables rt ON rt.object_id = fk.referenced_object_id
      INNER JOIN sys.columns rc ON rc.object_id = fkc.referenced_object_id AND rc.column_id = fkc.referenced_column_id
      WHERE t.name = @table
      ORDER BY fk.name, fkc.constraint_column_id
    `)
  const foreignKeys = mergeForeignKeys(
    fkResult.recordset.map((row: Record<string, unknown>) => ({
      name: str(row.name),
      column: str(row.column_name),
      refTable: str(row.ref_table),
      refColumn: str(row.ref_column),
      seq: Number(row.seq) || 0,
    })),
  )

  return {
    connectionId: target.id,
    tableName,
    dialect: 'sqlserver',
    columns,
    indexes: [...indexMap.values()],
    foreignKeys,
    ddl: composeCreateTable(tableName, columns, (n) => q('sqlserver', n)),
    ddlLabel: ddlLabelFor('sqlserver'),
  }
}
