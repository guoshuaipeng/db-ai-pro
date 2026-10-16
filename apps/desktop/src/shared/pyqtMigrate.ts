/** Map legacy PyQt DataAI ~/.db-ai/config.db connection rows into TransferConnection shape (M67). */

import type { Dialect } from './types'
import type { TransferConnection } from './connectionTransfer'

export type PyQtConnectionRow = {
  id: string
  name: string
  db_type: string
  host?: string | null
  port?: number | null
  database_name?: string | null
  username?: string | null
  /** Plaintext in legacy store — sealed only when applying in main. */
  password?: string | null
  created_at?: string | null
  updated_at?: string | null
}

export type PyQtMappedConnection = TransferConnection & {
  /** Plaintext password from PyQt; main seals before write. Never export this field. */
  passwordPlain?: string
}

const DIALECT_ALIASES: Record<string, Dialect> = {
  sqlite: 'sqlite',
  mysql: 'mysql',
  mariadb: 'mariadb',
  postgresql: 'postgresql',
  postgres: 'postgresql',
  pgsql: 'postgresql',
  sqlserver: 'sqlserver',
  mssql: 'sqlserver',
  redis: 'redis',
}

export function mapPyQtDialect(dbType: string): Dialect | null {
  const key = dbType.trim().toLowerCase()
  return DIALECT_ALIASES[key] ?? null
}

export function defaultPyQtConfigPath(homeDir: string): string {
  const sep = homeDir.includes('\\') || /^[A-Za-z]:/.test(homeDir) ? '\\' : '/'
  const base = homeDir.replace(/[/\\]+$/, '')
  return `${base}${sep}.db-ai${sep}config.db`
}

/** Convert one PyQt connections-table row; returns null when dialect unknown or name empty. */
export function mapPyQtConnectionRow(row: PyQtConnectionRow, now = () => new Date().toISOString()): PyQtMappedConnection | null {
  const name = (row.name ?? '').trim()
  if (!name) return null
  const dialect = mapPyQtDialect(row.db_type ?? '')
  if (!dialect) return null

  const createdAt = (row.created_at || '').trim() || now()
  const updatedAt = (row.updated_at || '').trim() || createdAt
  const passwordPlain = (row.password || '').trim() || undefined

  if (dialect === 'sqlite') {
    const filePath = (row.database_name || '').trim() || undefined
    return {
      id: row.id || cryptoRandomId(),
      name,
      dialect,
      filePath,
      createdAt,
      updatedAt,
      passwordPlain,
    }
  }

  const portRaw = row.port
  const port =
    typeof portRaw === 'number' && Number.isFinite(portRaw) && portRaw > 0 ? Math.trunc(portRaw) : undefined

  return {
    id: row.id || cryptoRandomId(),
    name,
    dialect,
    host: (row.host || '').trim() || undefined,
    port,
    database: (row.database_name || '').trim() || undefined,
    username: (row.username || '').trim() || undefined,
    createdAt,
    updatedAt,
    passwordPlain,
  }
}

export function mapPyQtConnectionRows(
  rows: readonly PyQtConnectionRow[],
  now = () => new Date().toISOString(),
): { mapped: PyQtMappedConnection[]; skipped: number } {
  const mapped: PyQtMappedConnection[] = []
  let skipped = 0
  for (const row of rows) {
    const next = mapPyQtConnectionRow(row, now)
    if (!next) {
      skipped += 1
      continue
    }
    mapped.push(next)
  }
  return { mapped, skipped }
}

function cryptoRandomId(): string {
  // Tests / Node — avoid pulling node:crypto into shared browser bundle.
  return `pyqt-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`
}