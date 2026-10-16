import pg from 'pg'
import { buildObjectTree, formatSchemaText, groupColumns } from '@shared/schema'
import { splitSql } from '@shared/sql'
import type { SchemaNode, StatementResult } from '@shared/types'
import { explainDbError } from './errors'
import type { ServerLogin } from './mysql'
import type { SqlTarget } from './target'

const COLUMN_SQL = `
  SELECT c.table_name, c.column_name, c.data_type
  FROM information_schema.columns c
  INNER JOIN information_schema.tables t
    ON t.table_schema = c.table_schema AND t.table_name = c.table_name
  WHERE c.table_schema = 'public' AND t.table_type = 'BASE TABLE'
  ORDER BY c.table_name, c.ordinal_position
`

type ColumnRow = { table_name: string; column_name: string; data_type: string }

export async function openPostgres(login: ServerLogin): Promise<pg.Client> {
  const client = new pg.Client({
    host: login.host,
    port: login.port,
    user: login.user,
    password: login.password,
    database: login.database,
    connectionTimeoutMillis: 8000,
  })
  await client.connect()
  return client
}

function cell(value: unknown): unknown {
  if (value instanceof Date) return value.toISOString()
  if (typeof value === 'bigint') return value.toString()
  if (Buffer.isBuffer(value)) return { type: 'blob', length: value.length }
  return value
}

function tablesFrom(rows: ColumnRow[]) {
  return groupColumns(
    rows.map((row) => ({
      table_name: row.table_name,
      column_name: row.column_name,
      data_type: row.data_type,
    })),
  )
}

export async function listPostgresSchema(client: pg.Client, target: SqlTarget): Promise<SchemaNode> {
  const result = await client.query<ColumnRow>(COLUMN_SQL)
  return buildObjectTree({
    connectionId: target.id,
    connectionName: target.name,
    dialect: 'postgresql',
    databaseName: target.database ?? '',
    tables: tablesFrom(result.rows),
  })
}

export async function describePostgres(client: pg.Client): Promise<string> {
  const result = await client.query<ColumnRow>(COLUMN_SQL)
  return formatSchemaText(tablesFrom(result.rows))
}

export async function executePostgres(client: pg.Client, sql: string): Promise<StatementResult[]> {
  const statements = splitSql(sql)
  if (statements.length === 0) {
    return [{ statement: '', ok: false, error: '没有可执行的语句', elapsedMs: 0 }]
  }

  const results: StatementResult[] = []
  for (const statement of statements) {
    const started = performance.now()
    try {
      const result = await client.query(statement)
      const elapsedMs = Math.max(0, Math.round(performance.now() - started))
      if (result.fields.length > 0) {
        const columns = result.fields.map((field) => field.name)
        results.push({
          statement,
          ok: true,
          columns,
          rows: result.rows.map((row: Record<string, unknown>) => {
            const next: Record<string, unknown> = {}
            for (const column of columns) next[column] = cell(row[column])
            return next
          }),
          elapsedMs,
        })
      } else {
        results.push({
          statement,
          ok: true,
          rowsAffected: result.rowCount ?? 0,
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
