import sql from 'mssql'
import { buildObjectTree, formatSchemaText, groupColumns } from '@shared/schema'
import { splitSql } from '@shared/sql'
import type { SchemaNode, StatementResult } from '@shared/types'
import { explainDbError } from './errors'
import type { SqlTarget } from './target'
import type { ServerLogin } from './mysql'

const COLUMN_SQL = `
  SELECT
    t.name AS table_name,
    c.name AS column_name,
    ty.name AS data_type
  FROM sys.tables AS t
  INNER JOIN sys.columns AS c ON c.object_id = t.object_id
  INNER JOIN sys.types AS ty ON ty.user_type_id = c.user_type_id
  WHERE t.is_ms_shipped = 0
  ORDER BY t.name, c.column_id
`

export async function openMssql(login: ServerLogin): Promise<sql.ConnectionPool> {
  const pool = new sql.ConnectionPool({
    server: login.host,
    port: login.port,
    user: login.user,
    password: login.password,
    database: login.database,
    options: {
      encrypt: false,
      trustServerCertificate: true,
      enableArithAbort: true,
    },
    connectionTimeout: 8000,
    requestTimeout: 30000,
    pool: { max: 4, min: 0, idleTimeoutMillis: 15000 },
  })
  await pool.connect()
  return pool
}

function cell(value: unknown): unknown {
  if (value instanceof Date) return value.toISOString()
  if (typeof value === 'bigint') return value.toString()
  if (Buffer.isBuffer(value)) return { type: 'blob', length: value.length }
  return value
}

export async function listMssqlSchema(pool: sql.ConnectionPool, target: SqlTarget): Promise<SchemaNode> {
  const result = await pool.request().query(COLUMN_SQL)
  const tables = groupColumns(
    result.recordset.map((row) => ({
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

export async function describeMssql(pool: sql.ConnectionPool): Promise<string> {
  const result = await pool.request().query(COLUMN_SQL)
  return formatSchemaText(
    groupColumns(
      result.recordset.map((row) => ({
        table_name: String(row.table_name),
        column_name: String(row.column_name),
        data_type: String(row.data_type),
      })),
    ),
  )
}

export async function executeMssql(pool: sql.ConnectionPool, script: string): Promise<StatementResult[]> {
  const statements = splitSql(script)
  if (statements.length === 0) {
    return [{ statement: '', ok: false, error: '没有可执行的语句', elapsedMs: 0 }]
  }

  const results: StatementResult[] = []
  for (const statement of statements) {
    const started = performance.now()
    try {
      const result = await pool.request().query(statement)
      const elapsedMs = Math.max(0, Math.round(performance.now() - started))
      const recordset = (result.recordset ?? []) as Record<string, unknown>[]
      const columns = recordset.length > 0 ? Object.keys(recordset[0] ?? {}) : []
      if (columns.length > 0 || Array.isArray(result.recordset)) {
        results.push({
          statement,
          ok: true,
          columns,
          rows: recordset.map((row) => {
            const next: Record<string, unknown> = {}
            for (const column of columns) next[column] = cell(row[column])
            return next
          }),
          rowsAffected: columns.length === 0 ? Number(result.rowsAffected?.[0] ?? 0) : undefined,
          elapsedMs,
        })
      } else {
        results.push({
          statement,
          ok: true,
          rowsAffected: Number(result.rowsAffected?.[0] ?? 0),
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
