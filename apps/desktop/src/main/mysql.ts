import mysql, { type ResultSetHeader, type RowDataPacket } from 'mysql2/promise'
import { buildObjectTree, formatSchemaText, groupColumns } from '@shared/schema'
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

export async function openMysql(login: ServerLogin): Promise<mysql.Connection> {
  return mysql.createConnection({
    host: login.host,
    port: login.port,
    user: login.user,
    password: login.password,
    database: login.database,
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

export async function listMysqlSchema(conn: mysql.Connection, target: SqlTarget): Promise<SchemaNode> {
  const [rows] = await conn.query<RowDataPacket[]>(COLUMN_SQL)
  const tables = groupColumns(
    rows.map((row) => ({
      table_name: String(row.table_name),
      column_name: String(row.column_name),
      data_type: String(row.data_type),
    })),
  )
  return buildObjectTree({
    connectionId: target.id,
    connectionName: target.name,
    dialect: target.dialect,
    databaseName: target.database ?? '',
    tables,
  })
}

export async function describeMysql(conn: mysql.Connection): Promise<string> {
  const [rows] = await conn.query<RowDataPacket[]>(COLUMN_SQL)
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
