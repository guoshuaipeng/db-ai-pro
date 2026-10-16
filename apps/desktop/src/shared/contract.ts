import type {
  AiEvent,
  AiSettingsInput,
  AiSettingsPublic,
  AppMeta,
  ConnectionInput,
  ConnectionPublic,
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
    seedSample: () => Promise<ConnectionPublic>
    pickFile: (mode: 'open' | 'save') => Promise<string | null>
  }
  sql: {
    execute: (payload: { connectionId: string; sql: string }) => Promise<StatementResult[]>
  }
  ai: {
    getSettings: () => Promise<AiSettingsPublic>
    saveSettings: (input: AiSettingsInput) => Promise<AiSettingsPublic>
    start: (payload: { requestId: string; connectionId: string | null; prompt: string }) => Promise<void>
    cancel: (requestId: string) => Promise<void>
    onEvent: (listener: (event: AiEvent) => void) => () => void
  }
  workspace: {
    load: () => Promise<WorkspaceState | null>
    save: (state: WorkspaceState) => Promise<void>
  }
}
