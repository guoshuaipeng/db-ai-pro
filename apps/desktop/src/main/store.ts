import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { app } from 'electron'
import { dialectInfo, needsServerDatabase } from '@shared/types'
import type {
  AiSettingsInput,
  AiSettingsPublic,
  ConnectionInput,
  ConnectionPublic,
  Dialect,
  QueryHistoryEntry,
  SqlFavorite,
  WorkspaceState,
} from '@shared/types'
import { QUERY_HISTORY_LIMIT, pushQueryHistory } from '@shared/queryHistory'
import { upsertFavorite } from '@shared/favorites'
import { createId } from './sampleDb'
import { migrateConnectionPlaintext, migrateSettingsPlaintext } from './migratePlaintext'
import { encryptionAvailable, openSecret, sealSecret } from './secrets'

type StoredConnection = {
  id: string
  name: string
  dialect: Dialect
  filePath?: string
  host?: string
  port?: number
  database?: string
  username?: string
  passwordCipher?: string
  /** Legacy plaintext — migrated on load and never written back. */
  password?: string
  createdAt: string
  updatedAt: string
}

type StoredSettings = {
  baseUrl: string
  model: string
  apiKeyCipher?: string
  /** Legacy plaintext — migrated on load and never written back. */
  apiKey?: string
}

type HistoryFile = {
  version: 1
  byConnection: Record<string, QueryHistoryEntry[]>
}

const DEFAULT_SETTINGS: StoredSettings = {
  baseUrl: 'https://api.openai.com/v1',
  model: 'gpt-4o-mini',
}

function dir(): string {
  const path = app.getPath('userData')
  mkdirSync(path, { recursive: true })
  return path
}

function readJson<T>(file: string, fallback: T): T {
  const path = join(dir(), file)
  if (!existsSync(path)) return fallback
  try {
    return JSON.parse(readFileSync(path, 'utf8')) as T
  } catch {
    return fallback
  }
}

function writeJson(file: string, value: unknown): void {
  writeFileSync(join(dir(), file), JSON.stringify(value, null, 2), 'utf8')
}

export function migrateStoredConnection(row: StoredConnection): { row: StoredConnection; changed: boolean } {
  const result = migrateConnectionPlaintext(row, sealSecret)
  return { row: result.row as StoredConnection, changed: result.changed }
}

export function migrateStoredSettings(stored: StoredSettings): { settings: StoredSettings; changed: boolean } {
  const result = migrateSettingsPlaintext(stored, sealSecret)
  return { settings: result.settings as StoredSettings, changed: result.changed }
}

function loadConnectionsRaw(): StoredConnection[] {
  const rows = readJson<StoredConnection[]>('connections.json', [])
  let dirty = false
  const migrated = rows.map((row) => {
    const result = migrateStoredConnection(row)
    if (result.changed) dirty = true
    return result.row
  })
  if (dirty) writeJson('connections.json', migrated)
  return migrated
}

function toPublic(row: StoredConnection): ConnectionPublic {
  return {
    id: row.id,
    name: row.name,
    dialect: row.dialect,
    filePath: row.filePath,
    host: row.host,
    port: row.port,
    database: row.database,
    username: row.username,
    hasPassword: Boolean(row.passwordCipher),
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  }
}

export function listConnections(): ConnectionPublic[] {
  return loadConnectionsRaw().map(toPublic)
}

export function getConnection(id: string): StoredConnection | undefined {
  return loadConnectionsRaw().find((row) => row.id === id)
}

export function saveConnection(input: ConnectionInput): { connection: ConnectionPublic } | { error: string } {
  const name = input.name.trim()
  if (!name) return { error: '请填写连接名称' }
  const info = dialectInfo(input.dialect)
  if (info.id === 'sqlite' && !input.filePath?.trim()) return { error: '请选择 SQLite 文件' }
  if (info.id !== 'sqlite' && !input.host?.trim()) return { error: '请填写主机' }
  if (needsServerDatabase(info.id) && !input.database?.trim()) return { error: '请填写数据库名' }

  const rows = loadConnectionsRaw()
  const now = new Date().toISOString()
  const existing = input.id ? rows.find((row) => row.id === input.id) : undefined

  let passwordCipher = existing?.passwordCipher
  if (input.password !== undefined) {
    if (!input.password) {
      passwordCipher = undefined
    } else {
      const sealed = sealSecret(input.password)
      if (!sealed.ok) return { error: '系统密钥环不可用，密码没有写入磁盘' }
      passwordCipher = sealed.cipher || undefined
    }
  }

  const next: StoredConnection = {
    id: existing?.id ?? createId(),
    name,
    dialect: input.dialect,
    filePath: input.filePath?.trim() || undefined,
    host: input.host?.trim() || undefined,
    port: input.port,
    database: input.database?.trim() || undefined,
    username: input.username?.trim() || undefined,
    passwordCipher,
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
  }

  const without = rows.filter((row) => row.id !== next.id)
  writeJson('connections.json', [...without, next])
  return { connection: toPublic(next) }
}

export function connectionPassword(row: StoredConnection): { password: string; locked: boolean } {
  if (row.passwordCipher) {
    const password = openSecret(row.passwordCipher)
    if (!password && !encryptionAvailable()) return { password: '', locked: true }
    return { password, locked: false }
  }
  if (row.password) return { password: row.password, locked: false }
  return { password: '', locked: false }
}

export function removeConnection(id: string): void {
  const rows = loadConnectionsRaw()
  writeJson(
    'connections.json',
    rows.filter((row) => row.id !== id),
  )
  const history = readHistoryFile()
  if (history.byConnection[id]) {
    delete history.byConnection[id]
    writeJson('query-history.json', history)
  }
}

export function hasConnectionStore(): boolean {
  return existsSync(join(dir(), 'connections.json'))
}

function loadSettingsRaw(): StoredSettings {
  const stored = readJson<StoredSettings>('ai-settings.json', DEFAULT_SETTINGS)
  const { settings, changed } = migrateStoredSettings(stored)
  if (changed) writeJson('ai-settings.json', settings)
  return settings
}

export function settingsPublic(): AiSettingsPublic {
  const stored = loadSettingsRaw()
  const probe = sealSecret('')
  return {
    baseUrl: stored.baseUrl || DEFAULT_SETTINGS.baseUrl,
    model: stored.model || DEFAULT_SETTINGS.model,
    hasKey: Boolean(stored.apiKeyCipher),
    encryption: probe.ok ? 'os' : 'unavailable',
  }
}

export function settingsSecrets(): { baseUrl: string; model: string; apiKey: string } {
  const stored = loadSettingsRaw()
  return {
    baseUrl: stored.baseUrl || DEFAULT_SETTINGS.baseUrl,
    model: stored.model || DEFAULT_SETTINGS.model,
    apiKey: openSecret(stored.apiKeyCipher),
  }
}

export function saveSettings(input: AiSettingsInput): { settings: AiSettingsPublic } | { error: string } {
  const current = loadSettingsRaw()
  let apiKeyCipher = current.apiKeyCipher
  if (input.apiKey !== undefined) {
    if (!input.apiKey) {
      apiKeyCipher = undefined
    } else {
      const sealed = sealSecret(input.apiKey)
      if (!sealed.ok) return { error: '系统密钥环不可用，密钥没有保存' }
      apiKeyCipher = sealed.cipher || undefined
    }
  }
  const next: StoredSettings = {
    baseUrl: input.baseUrl.trim() || DEFAULT_SETTINGS.baseUrl,
    model: input.model.trim() || DEFAULT_SETTINGS.model,
    apiKeyCipher,
  }
  writeJson('ai-settings.json', next)
  return { settings: settingsPublic() }
}

export function loadWorkspace(): WorkspaceState | null {
  const path = join(dir(), 'workspace.json')
  if (!existsSync(path)) return null
  try {
    const parsed = JSON.parse(readFileSync(path, 'utf8')) as WorkspaceState
    if (parsed.version !== 1 || !Array.isArray(parsed.editorTabs)) return null
    return parsed
  } catch {
    return null
  }
}

export function saveWorkspace(state: WorkspaceState): void {
  writeJson('workspace.json', state)
}

function readHistoryFile(): HistoryFile {
  const raw = readJson<HistoryFile | QueryHistoryEntry[]>('query-history.json', { version: 1, byConnection: {} })
  if (Array.isArray(raw)) {
    const byConnection: Record<string, QueryHistoryEntry[]> = {}
    for (const entry of raw) {
      if (!entry?.connectionId) continue
      byConnection[entry.connectionId] = byConnection[entry.connectionId] ?? []
      byConnection[entry.connectionId].push(entry)
    }
    return { version: 1, byConnection }
  }
  if (!raw || raw.version !== 1 || typeof raw.byConnection !== 'object' || !raw.byConnection) {
    return { version: 1, byConnection: {} }
  }
  return raw
}

export function listQueryHistory(connectionId: string, limit = QUERY_HISTORY_LIMIT): QueryHistoryEntry[] {
  const file = readHistoryFile()
  const rows = file.byConnection[connectionId] ?? []
  return rows.slice(0, Math.max(1, limit))
}

export function appendQueryHistory(input: {
  connectionId: string
  sql: string
  ok: boolean
  error?: string
  elapsedMs?: number
}): QueryHistoryEntry {
  const entry: QueryHistoryEntry = {
    id: createId(),
    connectionId: input.connectionId,
    sql: input.sql.trim(),
    ok: input.ok,
    error: input.error,
    elapsedMs: input.elapsedMs,
    createdAt: new Date().toISOString(),
  }
  if (!entry.sql) return entry

  const file = readHistoryFile()
  const existing = file.byConnection[input.connectionId] ?? []
  file.byConnection[input.connectionId] = pushQueryHistory(existing, entry)
  writeJson('query-history.json', file)
  return entry
}

export function clearQueryHistory(connectionId: string): void {
  const file = readHistoryFile()
  if (!file.byConnection[connectionId]) return
  delete file.byConnection[connectionId]
  writeJson('query-history.json', file)
}

export function removeQueryHistoryEntry(connectionId: string, entryId: string): void {
  const file = readHistoryFile()
  const rows = file.byConnection[connectionId]
  if (!rows) return
  file.byConnection[connectionId] = rows.filter((row) => row.id !== entryId)
  writeJson('query-history.json', file)
}


export function listFavorites(): SqlFavorite[] {
  return readJson<SqlFavorite[]>('favorites.json', [])
}

export function saveFavorite(input: {
  id?: string
  name: string
  sql: string
  connectionId?: string | null
}): { favorite: SqlFavorite } | { error: string } {
  const name = input.name.trim()
  const sql = input.sql.trim()
  if (!name) return { error: '请填写片段名称' }
  if (!sql) return { error: '请填写 SQL 内容' }
  const rows = listFavorites()
  const now = new Date().toISOString()
  const existing = input.id ? rows.find((row) => row.id === input.id) : undefined
  const next: SqlFavorite = {
    id: existing?.id ?? createId(),
    name,
    sql,
    connectionId: input.connectionId === undefined ? (existing?.connectionId ?? null) : input.connectionId,
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
  }
  writeJson('favorites.json', upsertFavorite(rows, next))
  return { favorite: next }
}

export function removeFavorite(id: string): void {
  writeJson(
    'favorites.json',
    listFavorites().filter((row) => row.id !== id),
  )
}
