import mysql, { type ResultSetHeader, type RowDataPacket } from 'mysql2/promise'
import { buildMultiDatabaseObjectTree, formatSchemaText, groupColumns } from '@shared/schema'
import { MYSQL_HIDDEN_SCHEMAS, resolveVisibleDatabases } from '@shared/dbVisibility'
import type { SchemaNode, StatementResult } from '@shared/types'
import { splitSql } from '@shared/sql'
import { explainDbError } from './errors'
import type { SqlTarget } from './target'

export type ServerLogin = {
  host: string
  port: number
  user: string
  password: string
  database: string
}

const COLUMN_SQL = `
  SELECT TABLE_NAME AS table_name, COLUMN_NAME AS column_name, COLUMN_TYPE AS data_type
  FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
  ORDER BY TABLE_NAME, ORDINAL_POSITION
`

const LIST_DB_SQL = `
  SELECT SCHEMA_NAME AS name
  FROM information_schema.SCHEMATA
  ORDER BY SCHEMA_NAME
`

export async function openMysql(login: ServerLogin): Promise<mysql.Connection> {
  return mysql.createConnection({
    host: login.host,
    port: login.port,
    user: login.user,
    password: login.password,
    ...(login.database?.trim() ? { database: login.database.trim() } : {}),
    connectTimeout: 8000,
    dateStrings: true,
    supportBigNumbers: true,
    bigNumberStrings: true,
  })
}

function cell(value: unknown): unknown {
  if (value instanceof Date) return value.toISOString()
  if (typeof value === 'bigint') return value.toString()
  if (Buffer.isBuffer(value)) return { type: 'blob', length: value.length }
  return value
}

export async function listMysqlDatabases(conn: mysql.Connection): Promise<string[]> {
  const [rows] = await conn.query<RowDataPacket[]>(LIST_DB_SQL)
  return rows
    .map((row) => String(row.name))
    .filter((name) => name && !MYSQL_HIDDEN_SCHEMAS.has(name))
}

export async function listMysqlSchema(
  conn: mysql.Connection,
  target: SqlTarget,
  visibleWhitelist?: string[] | null,
): Promise<SchemaNode> {
  const all = await listMysqlDatabases(conn)
  const visible = resolveVisibleDatabases(all, visibleWhitelist)
  if (visible.length === 0) {
    return buildMultiDatabaseObjectTree({
      connectionId: target.id,
      connectionName: target.name,
      dialect: target.dialect,
      databases: [],
    })
  }
  const placeholders = visible.map(() => '?').join(', ')
  const [rows] = await conn.query<RowDataPacket[]>(
    `SELECT TABLE_SCHEMA AS schema_name, TABLE_NAME AS table_name, COLUMN_NAME AS column_name, COLUMN_TYPE AS data_type
     FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA IN (${placeholders})
     ORDER BY TABLE_SCHEMA, TABLE_NAME, ORDINAL_POSITION`,
    visible,
  )
  const byDb = new Map<string, { table_name: string; column_name: string; data_type: string }[]>()
  for (const name of visible) byDb.set(name, [])
  for (const row of rows) {
    const schema = String(row.schema_name)
    const bucket = byDb.get(schema)
    if (!bucket) continue
    bucket.push({
      table_name: String(row.table_name),
      column_name: String(row.column_name),
      data_type: String(row.data_type),
    })
  }
  const databases = visible.map((name) => ({
    name,
    tables: groupColumns(byDb.get(name) ?? []),
  }))
  return buildMultiDatabaseObjectTree({
    connectionId: target.id,
    connectionName: target.name,
    dialect: target.dialect,
    databases,
  })
}

export async function describeMysql(
  conn: mysql.Connection,
  databaseName?: string | null,
): Promise<string> {
  const db = databaseName?.trim()
  const [rows] = db
    ? await conn.query<RowDataPacket[]>(
        `SELECT TABLE_NAME AS table_name, COLUMN_NAME AS column_name, COLUMN_TYPE AS data_type
         FROM information_schema.COLUMNS
         WHERE TABLE_SCHEMA = ?
         ORDER BY TABLE_NAME, ORDINAL_POSITION`,
        [db],
      )
    : await conn.query<RowDataPacket[]>(COLUMN_SQL)
  return formatSchemaText(
    groupColumns(
      rows.map((row) => ({
        table_name: String(row.table_name),
        column_name: String(row.column_name),
        data_type: String(row.data_type),
      })),
    ),
  )
}

export async function executeMysql(conn: mysql.Connection, sql: string): Promise<StatementResult[]> {
  const statements = splitSql(sql)
  if (statements.length === 0) {
    return [{ statement: '', ok: false, error: '没有可执行的语句', elapsedMs: 0 }]
  }

  const results: StatementResult[] = []
  for (const statement of statements) {
    const started = performance.now()
    try {
      const [rows, fields] = await conn.query(statement)
      const elapsedMs = Math.max(0, Math.round(performance.now() - started))
      if (Array.isArray(rows)) {
        const packets = rows as RowDataPacket[]
        const named = (fields ?? []).map((field) => field.name)
        const columns = named.length > 0 ? named : packets[0] ? Object.keys(packets[0]) : []
        results.push({
          statement,
          ok: true,
          columns,
          rows: packets.map((row) => {
            const next: Record<string, unknown> = {}
            for (const column of columns) next[column] = cell(row[column])
            return next
          }),
          elapsedMs,
        })
      } else {
        const header = rows as ResultSetHeader
        results.push({
          statement,
          ok: true,
          rowsAffected: Number(header.affectedRows ?? 0),
          elapsedMs,
        })
      }
    } catch (error) {
      results.push({
        statement,
        ok: false,
        error: explainDbError(error),
        elapsedMs: Math.max(0, Math.round(performance.now() - started)),
      })
      break
    }
  }
  return results
}
