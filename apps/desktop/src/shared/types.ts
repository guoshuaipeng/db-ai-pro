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
  executable: boolean
}

export const DIALECTS: DialectInfo[] = [
  { id: 'sqlite', label: 'SQLite', executable: true },
  { id: 'mysql', label: 'MySQL', defaultPort: 3306, executable: true },
  { id: 'mariadb', label: 'MariaDB', defaultPort: 3306, executable: true },
  { id: 'postgresql', label: 'PostgreSQL', defaultPort: 5432, executable: true },
  { id: 'oracle', label: 'Oracle', defaultPort: 1521, executable: false },
  { id: 'sqlserver', label: 'SQL Server', defaultPort: 1433, executable: false },
  { id: 'hive', label: 'Hive', defaultPort: 10000, executable: false },
  { id: 'redis', label: 'Redis', defaultPort: 6379, executable: false },
]

export function dialectInfo(id: Dialect): DialectInfo {
  return DIALECTS.find((item) => item.id === id) ?? DIALECTS[0]
}

export function needsServerDatabase(dialect: Dialect): boolean {
  return dialect === 'mysql' || dialect === 'mariadb' || dialect === 'postgresql'
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
  createdAt: string
  updatedAt: string
}

export type SchemaNode = {
  id: string
  kind: 'connection' | 'database' | 'table' | 'column' | 'note'
  name: string
  displayName: string
  dialect?: Dialect
  connectionId?: string
  tableName?: string
  dataType?: string
  status?: 'ok' | 'error'
  note?: string
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

export type AiSettingsInput = {
  baseUrl: string
  model: string
  apiKey?: string
}

export type AiEvent =
  | { requestId: string; type: 'delta'; delta: string; mode: 'model' | 'preview' }
  | { requestId: string; type: 'done'; mode: 'model' | 'preview' }
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
}

export type AiTurnState = {
  id: string
  role: 'user' | 'assistant'
  content: string
  mode?: 'model' | 'preview'
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
