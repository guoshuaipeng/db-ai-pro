import type {
  AiEvent,
  AiIntent,
  AiSettingsInput,
  AiSettingsPublic,
  AppMeta,
  ConnectionInput,
  ConnectionPublic,
  RedisKeyInfo,
  RedisValueView,
  SchemaNode,
  StatementResult,
  WorkspaceState,
} from './types'

export type DesktopApi = {
  meta: () => Promise<AppMeta>
  connections: {
    list: () => Promise<ConnectionPublic[]>
    save: (input: ConnectionInput) => Promise<ConnectionPublic>
    remove: (id: string) => Promise<void>
    schema: (id: string) => Promise<SchemaNode>
    test: (input: ConnectionInput) => Promise<{ ok: boolean; error?: string }>
    seedSample: () => Promise<ConnectionPublic>
    pickFile: (mode: 'open' | 'save') => Promise<string | null>
  }
  sql: {
    execute: (payload: { connectionId: string; sql: string }) => Promise<StatementResult[]>
    updateSqliteCell: (payload: {
      connectionId: string
      table: string
      rowid: number
      column: string
      value: string | number | null
    }) => Promise<StatementResult[]>
  }
  redis: {
    scan: (payload: { connectionId: string; pattern?: string; count?: number }) => Promise<RedisKeyInfo[]>
    get: (payload: { connectionId: string; key: string }) => Promise<RedisValueView>
  }
  ai: {
    getSettings: () => Promise<AiSettingsPublic>
    saveSettings: (input: AiSettingsInput) => Promise<AiSettingsPublic>
    start: (payload: {
      requestId: string
      connectionId: string | null
      prompt: string
      intent?: AiIntent
      referenceTable?: string
      targetTable?: string
      history?: string
    }) => Promise<void>
    repair: (payload: {
      requestId: string
      connectionId: string | null
      sql: string
      error: string
    }) => Promise<void>
    cancel: (requestId: string) => Promise<void>
    onEvent: (listener: (event: AiEvent) => void) => () => void
  }
  workspace: {
    load: () => Promise<WorkspaceState | null>
    save: (state: WorkspaceState) => Promise<void>
  }
}
