import type {
  AiEvent,
  AiIntent,
  AiSettingsInput,
  AiSettingsPublic,
  AppMeta,
  ConnectionInput,
  ConnectionPublic,
  QueryHistoryEntry,
  RedisKeyInfo,
  RedisValueView,
  SchemaNode,
  SqlFavorite,
  FavoriteFolder,
  StatementResult,
  WorkspaceState,
} from './types'
import type { ConnectionBundle, ImportPlanItem } from './connectionTransfer'
import type { AppPrefs } from './prefs'
import type { TableStructure } from './tableStructure'
import type { ImportSheetData } from './importPlan'

export type DesktopApi = {
  meta: () => Promise<AppMeta>
  window: {
    minimize: () => Promise<void>
    maximize: () => Promise<{ maximized: boolean }>
    close: () => Promise<{ closed: boolean } | void>
    isMaximized: () => Promise<boolean>
  }
  prefs: {
    get: () => Promise<AppPrefs>
    save: (input: Partial<AppPrefs>) => Promise<AppPrefs>
  }
  app: {
    openUserData: () => Promise<{ ok: true; path: string } | { ok: false; error: string }>
    openLogs: () => Promise<{ ok: true; path: string } | { ok: false; error: string }>
  }
  connections: {
    list: () => Promise<ConnectionPublic[]>
    save: (input: ConnectionInput) => Promise<ConnectionPublic>
    remove: (id: string) => Promise<void>
    schema: (id: string) => Promise<SchemaNode>
    test: (input: ConnectionInput) => Promise<{ ok: boolean; error?: string }>
    seedSample: () => Promise<ConnectionPublic>
    pickFile: (mode: 'open' | 'save') => Promise<string | null>
    exportBundle: () => Promise<{ path: string | null; count: number }>
    importPreview: () => Promise<
      { path: string; plan: ImportPlanItem[] } | { error: string; path?: string } | { cancelled: true }
    >
    importApply: (plan: ImportPlanItem[]) => Promise<{ connections: ConnectionPublic[]; imported: number }>
  }
  sql: {
    execute: (payload: {
      connectionId: string
      sql: string
      requestId?: string
      timeoutMs?: number
    }) => Promise<StatementResult[]>
    explain: (payload: {
      connectionId: string
      sql: string
      requestId?: string
      timeoutMs?: number
    }) => Promise<StatementResult[]>
    cancel: (requestId: string) => Promise<{ ok: boolean }>
    txnStatus: (connectionId: string) => Promise<{ open: boolean; supported: boolean }>
    beginTxn: (connectionId: string) => Promise<{ open: boolean; supported: boolean }>
    commitTxn: (connectionId: string) => Promise<{ open: boolean; supported: boolean }>
    rollbackTxn: (connectionId: string) => Promise<{ open: boolean; supported: boolean }>
    tableStructure: (payload: { connectionId: string; table: string }) => Promise<TableStructure>
    importPick: () => Promise<{ path: string } | { cancelled: true }>
    importRead: (filePath: string) => Promise<ImportSheetData>
    updateSqliteCell: (payload: {
      connectionId: string
      table: string
      rowid: number
      column: string
      value: string | number | null
    }) => Promise<StatementResult[]>
  }
  history: {
    list: (connectionId: string) => Promise<QueryHistoryEntry[]>
    clear: (connectionId: string) => Promise<void>
    remove: (connectionId: string, entryId: string) => Promise<void>
  }
  favorites: {
    list: () => Promise<SqlFavorite[]>
    save: (input: {
      id?: string
      name: string
      sql: string
      connectionId?: string | null
      folderId?: string | null
    }) => Promise<SqlFavorite>
    remove: (id: string) => Promise<void>
    listFolders: () => Promise<FavoriteFolder[]>
    saveFolder: (input: { id?: string; name: string }) => Promise<FavoriteFolder>
    removeFolder: (id: string) => Promise<void>
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

export type { ConnectionBundle, ImportPlanItem }
