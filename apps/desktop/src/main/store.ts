import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { app } from 'electron'
import { dialectInfo } from '@shared/types'
import type { AiSettingsInput, AiSettingsPublic, ConnectionInput, ConnectionPublic, Dialect, WorkspaceState } from '@shared/types'
import { createId } from './sampleDb'
import { openSecret, sealSecret } from './secrets'

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
  createdAt: string
  updatedAt: string
}

type StoredSettings = {
  baseUrl: string
  model: string
  apiKeyCipher?: string
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
  return readJson<StoredConnection[]>('connections.json', []).map(toPublic)
}

export function getConnection(id: string): StoredConnection | undefined {
  return readJson<StoredConnection[]>('connections.json', []).find((row) => row.id === id)
}

export function saveConnection(input: ConnectionInput): { connection: ConnectionPublic } | { error: string } {
  const name = input.name.trim()
  if (!name) return { error: '请填写连接名称' }
  const info = dialectInfo(input.dialect)
  if (info.id === 'sqlite' && !input.filePath?.trim()) return { error: '请选择 SQLite 文件' }
  if (info.id !== 'sqlite' && !input.host?.trim()) return { error: '请填写主机' }

  const rows = readJson<StoredConnection[]>('connections.json', [])
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

export function removeConnection(id: string): void {
  const rows = readJson<StoredConnection[]>('connections.json', [])
  writeJson(
    'connections.json',
    rows.filter((row) => row.id !== id),
  )
}

export function hasConnectionStore(): boolean {
  return existsSync(join(dir(), 'connections.json'))
}

export function settingsPublic(): AiSettingsPublic {
  const stored = readJson<StoredSettings>('ai-settings.json', DEFAULT_SETTINGS)
  const probe = sealSecret('')
  return {
    baseUrl: stored.baseUrl || DEFAULT_SETTINGS.baseUrl,
    model: stored.model || DEFAULT_SETTINGS.model,
    hasKey: Boolean(stored.apiKeyCipher),
    encryption: probe.ok ? 'os' : 'unavailable',
  }
}

export function settingsSecrets(): { baseUrl: string; model: string; apiKey: string } {
  const stored = readJson<StoredSettings>('ai-settings.json', DEFAULT_SETTINGS)
  return {
    baseUrl: stored.baseUrl || DEFAULT_SETTINGS.baseUrl,
    model: stored.model || DEFAULT_SETTINGS.model,
    apiKey: openSecret(stored.apiKeyCipher),
  }
}

export function saveSettings(input: AiSettingsInput): { settings: AiSettingsPublic } | { error: string } {
  const current = readJson<StoredSettings>('ai-settings.json', DEFAULT_SETTINGS)
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
