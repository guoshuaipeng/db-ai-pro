export type Dialect =
  | 'sqlite'
  | 'mysql'
  | 'mariadb'
  | 'postgresql'
  | 'oracle'
  | 'sqlserver'
  | 'hive'
  | 'redis'

export type DialectInfo = {
  id: Dialect
  label: string
  defaultPort?: number
  /** SQL 查询是否已接通 */
  executable: boolean
  /** Redis 等 KV 浏览是否已接通 */
  kv?: boolean
}

export const DIALECTS: DialectInfo[] = [
  { id: 'sqlite', label: 'SQLite', executable: true },
  { id: 'mysql', label: 'MySQL', defaultPort: 3306, executable: true },
  { id: 'mariadb', label: 'MariaDB', defaultPort: 3306, executable: true },
  { id: 'postgresql', label: 'PostgreSQL', defaultPort: 5432, executable: true },
  { id: 'oracle', label: 'Oracle', defaultPort: 1521, executable: false },
  { id: 'sqlserver', label: 'SQL Server', defaultPort: 1433, executable: true },
  { id: 'hive', label: 'Hive', defaultPort: 10000, executable: false },
  { id: 'redis', label: 'Redis', defaultPort: 6379, executable: false, kv: true },
]

export function dialectInfo(id: Dialect): DialectInfo {
  return DIALECTS.find((item) => item.id === id) ?? DIALECTS[0]
}

export function needsServerDatabase(dialect: Dialect): boolean {
  return dialect === 'mysql' || dialect === 'mariadb' || dialect === 'postgresql' || dialect === 'sqlserver'
}

export function isKvDialect(dialect: Dialect): boolean {
  return Boolean(dialectInfo(dialect).kv)
}

export function canInspect(dialect: Dialect): boolean {
  const info = dialectInfo(dialect)
  return info.executable || Boolean(info.kv)
}

export type ConnectionInput = {
  id?: string
  name: string
  dialect: Dialect
  filePath?: string
  host?: string
  port?: number
  database?: string
  username?: string
  password?: string
  createFile?: boolean
  /** Per-connection safe mode: block writes / DDL. */
  readOnly?: boolean
}

export type ConnectionPublic = {
  id: string
  name: string
  dialect: Dialect
  filePath?: string
  host?: string
  port?: number
  database?: string
  username?: string
  hasPassword: boolean
  /** Per-connection safe mode. */
  readOnly?: boolean
  createdAt: string
  updatedAt: string
}

export type SchemaNode = {
  id: string
  kind: 'connection' | 'database' | 'table' | 'column' | 'note' | 'key'
  name: string
  displayName: string
  dialect?: Dialect
  connectionId?: string
  tableName?: string
  dataType?: string
  status?: 'ok' | 'error'
  note?: string
  redisKey?: string
  redisType?: string
  ttl?: number
  children?: SchemaNode[]
}

export type StatementResult = {
  statement: string
  ok: boolean
  columns?: string[]
  rows?: Record<string, unknown>[]
  rowsAffected?: number
  error?: string
  elapsedMs: number
}

export type AiSettingsPublic = {
  baseUrl: string
  model: string
  hasKey: boolean
  encryption: 'os' | 'unavailable'
}

export type AiIntent = 'query' | 'create' | 'alter'

export type AiSettingsInput = {
  baseUrl: string
  model: string
  apiKey?: string
}

export type AiEvent =
  | { requestId: string; type: 'delta'; delta: string; mode: 'model' | 'preview' }
  | { requestId: string; type: 'progress'; mode: 'model' | 'preview'; step: string; detail?: string }
  | { requestId: string; type: 'done'; mode: 'model' | 'preview'; cancelled?: boolean }
  | { requestId: string; type: 'error'; message: string }

export type AppMeta = {
  version: string
  encryption: 'os' | 'unavailable'
  mode: 'desktop' | 'preview'
}

export type EditorTabState = {
  id: string
  title: string
  sql: string
  /** Bound connection for this tab; null = use workspace active. No secrets. */
  connectionId?: string | null
}

export type AiTurnState = {
  id: string
  role: 'user' | 'assistant'
  content: string
  mode?: 'model' | 'preview'
  steps?: { step: string; detail?: string }[]
  /** settled status after stream ends or user stops */
  status?: 'streaming' | 'done' | 'cancelled' | 'error'
}

export type WorkspaceState = {
  version: 1
  activeConnectionId: string | null
  editorTabs: EditorTabState[]
  activeEditorId: string
  aiTurns: AiTurnState[]
  sidebarWidth: number
  aiWidth: number
  editorRatio: number
  sidebarOpen: boolean
  aiOpen: boolean
}

export type FavoriteFolder = {
  id: string
  name: string
  createdAt: string
  updatedAt: string
}

export type SqlFavorite = {
  id: string
  name: string
  sql: string
  /** null = global snippet */
  connectionId: string | null
  /** null / missing = 未分组 */
  folderId?: string | null
  createdAt: string
  updatedAt: string
}

export type QueryHistoryEntry = {
  id: string
  connectionId: string
  sql: string
  ok: boolean
  error?: string
  elapsedMs?: number
  createdAt: string
}

export type RedisKeyInfo = {
  key: string
  type: string
  ttl: number
}

export type RedisValueView =
  | { kind: 'string'; value: string }
  | { kind: 'hash'; fields: { field: string; value: string }[] }
  | { kind: 'list'; items: string[] }
  | { kind: 'zset'; items: { member: string; score: number }[] }
  | { kind: 'set'; members: string[] }
  | { kind: 'unsupported'; redisType: string; note: string }
