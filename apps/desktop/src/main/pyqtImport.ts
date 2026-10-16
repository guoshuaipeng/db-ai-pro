import { existsSync } from 'node:fs'
import { homedir } from 'node:os'
import Database from 'better-sqlite3'
import {
  defaultPyQtConfigPath,
  mapPyQtConnectionRows,
  type PyQtConnectionRow,
  type PyQtMappedConnection,
} from '@shared/pyqtMigrate'
import { sanitizeTransferRow, type TransferConnection } from '@shared/connectionTransfer'
import { sealSecret } from './secrets'
import { previewTransferImport } from './store'

function sealMapped(row: PyQtMappedConnection): TransferConnection {
  let passwordCipher: string | undefined
  if (row.passwordPlain) {
    const sealed = sealSecret(row.passwordPlain)
    if (sealed.ok && sealed.cipher) passwordCipher = sealed.cipher
  }
  return sanitizeTransferRow({
    id: row.id,
    name: row.name,
    dialect: row.dialect,
    filePath: row.filePath,
    host: row.host,
    port: row.port,
    database: row.database,
    username: row.username,
    passwordCipher,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  })
}

export function resolvePyQtConfigPath(explicit?: string | null): string {
  if (explicit?.trim()) return explicit.trim()
  return defaultPyQtConfigPath(homedir())
}

export function readPyQtConnectionRows(filePath: string): PyQtConnectionRow[] {
  const db = new Database(filePath, { readonly: true, fileMustExist: true })
  try {
    const tables = db
      .prepare(`SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'connections'`)
      .all() as { name: string }[]
    if (tables.length === 0) {
      throw new Error('不是旧版 DataAI 配置库（缺少 connections 表）')
    }
    return db
      .prepare(
        `SELECT id, name, db_type, host, port, database_name, username, password, created_at, updated_at
         FROM connections
         ORDER BY updated_at DESC, name COLLATE NOCASE`,
      )
      .all() as PyQtConnectionRow[]
  } finally {
    db.close()
  }
}

export function previewPyQtImport(filePath?: string | null):
  | { path: string; plan: import('@shared/connectionTransfer').ImportPlanItem[]; skipped: number; found: number }
  | { error: string; path?: string } {
  const path = resolvePyQtConfigPath(filePath)
  if (!existsSync(path)) {
    return { error: `未找到旧版配置：${path}`, path }
  }
  try {
    const rows = readPyQtConnectionRows(path)
    const { mapped, skipped } = mapPyQtConnectionRows(rows)
    if (mapped.length === 0) {
      return { error: skipped ? '旧版配置里没有可识别的连接' : '旧版配置里没有连接', path }
    }
    const incoming = mapped.map(sealMapped)
    const preview = previewTransferImport(incoming)
    if ('error' in preview) return { error: preview.error, path }
    return { path, plan: preview.plan, skipped, found: mapped.length }
  } catch (error) {
    return { error: error instanceof Error ? error.message : '无法读取旧版配置库', path }
  }
}