import { existsSync } from 'node:fs'
import { basename } from 'node:path'
import Database from 'better-sqlite3'
import { tableLabel } from '@shared/labels'
import { quoteIdent, splitSql } from '@shared/sql'
import type { SchemaNode, StatementResult } from '@shared/types'

export function openDatabase(filePath: string): Database.Database {
  const db = new Database(filePath)
  db.pragma('foreign_keys = ON')
  db.pragma('busy_timeout = 3000')
  return db
}

export function databaseExists(filePath: string): boolean {
  return existsSync(filePath)
}

export function listSchema(connectionId: string, connectionName: string, filePath: string, db: Database.Database): SchemaNode {
  const tables = db
    .prepare(
      `SELECT name
       FROM sqlite_master
       WHERE type = 'table' AND name NOT LIKE 'sqlite_%'
       ORDER BY name`,
    )
    .all() as { name: string }[]

  return {
    id: connectionId,
    kind: 'connection',
    name: connectionName,
    displayName: connectionName,
    dialect: 'sqlite',
    connectionId,
    children: [
      {
        id: `${connectionId}:db`,
        kind: 'database',
        name: basename(filePath),
        displayName: basename(filePath),
        connectionId,
        children: tables.map((table) => ({
          id: `${connectionId}:table:${table.name}`,
          kind: 'table' as const,
          name: table.name,
          displayName: tableLabel(table.name),
          connectionId,
          tableName: table.name,
        })),
      },
    ],
  }
}

export function describeSchema(db: Database.Database): string {
  const tables = db
    .prepare(
      `SELECT name FROM sqlite_master
       WHERE type = 'table' AND name NOT LIKE 'sqlite_%'
       ORDER BY name`,
    )
    .all() as { name: string }[]

  return tables
    .map((table) => {
      const columns = db.prepare(`PRAGMA table_info(${quoteIdent(table.name)})`).all() as { name: string; type: string }[]
      const body = columns.map((column) => `${column.name} ${column.type}`.trim()).join(', ')
      return `${table.name} (${body})`
    })
    .join('\n')
}

function normalizeRow(row: Record<string, unknown>): Record<string, unknown> {
  const next: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(row)) {
    if (value instanceof Uint8Array) next[key] = { type: 'blob', length: value.byteLength }
    else if (typeof value === 'bigint') next[key] = value.toString()
    else next[key] = value
  }
  return next
}

export function executeScript(db: Database.Database, sql: string): StatementResult[] {
  const statements = splitSql(sql)
  if (statements.length === 0) {
    return [{ statement: '', ok: false, error: '没有可执行的语句', elapsedMs: 0 }]
  }

  const results: StatementResult[] = []
  for (const statement of statements) {
    const started = performance.now()
    try {
      const prepared = db.prepare(statement)
      if (prepared.reader) {
        const rows = (prepared.all() as Record<string, unknown>[]).map(normalizeRow)
        const columns = rows.length > 0 ? Object.keys(rows[0]) : prepared.columns().map((column) => column.name)
        results.push({
          statement,
          ok: true,
          columns,
          rows,
          elapsedMs: Math.max(0, Math.round(performance.now() - started)),
        })
      } else {
        const info = prepared.run()
        results.push({
          statement,
          ok: true,
          rowsAffected: Number(info.changes ?? 0),
          elapsedMs: Math.max(0, Math.round(performance.now() - started)),
        })
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : '执行失败'
      results.push({
        statement,
        ok: false,
        error: message,
        elapsedMs: Math.max(0, Math.round(performance.now() - started)),
      })
      break
    }
  }
  return results
}
