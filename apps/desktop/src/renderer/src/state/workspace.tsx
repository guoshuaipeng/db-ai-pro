import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import { getApi } from '../bridge'
import { statementTitle } from '@shared/sql'
import { selectAll } from '@shared/sql'
import { INITIAL_TABS } from '@shared/session'
import { filterNodes } from '@shared/tree'
import type {
  AiSettingsPublic,
  AiTurnState,
  AppMeta,
  ConnectionInput,
  ConnectionPublic,
  EditorTabState,
  SchemaNode,
  StatementResult,
  WorkspaceState,
} from '@shared/types'

export type ResultTab = {
  id: string
  title: string
  kind: 'grid' | 'message'
  columns?: string[]
  rows?: Record<string, unknown>[]
  message?: string
}

export type ResultState = { tabs: ResultTab[]; activeId: string }

export type Toast = { id: string; tone: 'info' | 'error' | 'success'; text: string }

type DialogState =
  | null
  | { type: 'connection'; connection?: ConnectionPublic }
  | { type: 'delete'; connection: ConnectionPublic }

type WorkspaceValue = {
  ready: boolean
  meta: AppMeta | null
  connections: ConnectionPublic[]
  schema: SchemaNode[]
  filteredSchema: SchemaNode[]
  search: string
  setSearch: (value: string) => void
  expanded: Record<string, boolean>
  toggleExpanded: (id: string) => void
  selectedId: string | null
  activeConnection: ConnectionPublic | null
  selectNode: (node: SchemaNode) => void
  editorTabs: EditorTabState[]
  activeEditor: EditorTabState | null
  setActiveEditor: (id: string) => void
  updateSql: (sql: string) => void
  newTab: () => void
  closeTab: (id: string) => void
  results: ResultState | null
  setActiveResult: (id: string) => void
  running: boolean
  run: () => Promise<void>
  cursor: { line: number; column: number }
  setCursor: (cursor: { line: number; column: number }) => void
  aiTurns: AiTurnState[]
  aiStreaming: boolean
  sendAi: (text?: string) => Promise<void>
  cancelAi: () => void
  applySql: (sql: string) => void
  settings: AiSettingsPublic | null
  saveSettings: (input: { baseUrl: string; model: string; apiKey?: string }) => Promise<void>
  toasts: Toast[]
  dismissToast: (id: string) => void
  dialog: DialogState
  openCreate: () => void
  openEdit: (connection: ConnectionPublic) => void
  askDelete: (connection: ConnectionPublic) => void
  closeDialog: () => void
  saveConnection: (input: ConnectionInput) => Promise<void>
  deleteConnection: (id: string) => Promise<void>
  restoreSample: () => Promise<void>
  pickFile: (mode: 'open' | 'save') => Promise<string | null>
  sidebarWidth: number
  aiWidth: number
  editorRatio: number
  setSidebarWidth: (value: number) => void
  setAiWidth: (value: number) => void
  setEditorRatio: (value: number) => void
  sidebarOpen: boolean
  aiOpen: boolean
  toggleSidebar: () => void
  toggleAi: () => void
  breadcrumb: string
}

const WorkspaceContext = createContext<WorkspaceValue | null>(null)

function seedTabs(): EditorTabState[] {
  return INITIAL_TABS.map((tab, index) => ({
    id: `query-${index + 1}`,
    title: tab.title,
    sql: tab.sql,
  }))
}

function resultsFrom(statements: StatementResult[]): ResultState {
  const tabs: ResultTab[] = []
  const lines: string[] = []
  statements.forEach((result, index) => {
    const title = statementTitle(result.statement, index)
    if (result.ok && result.columns) {
      tabs.push({
        id: `grid-${index}`,
        title,
        kind: 'grid',
        columns: result.columns,
        rows: result.rows ?? [],
      })
      lines.push(`${title} · ${result.rows?.length ?? 0} 行 · ${result.elapsedMs} ms`)
    } else if (result.ok) {
      lines.push(`${title} · 已影响 ${result.rowsAffected ?? 0} 行 · ${result.elapsedMs} ms`)
    } else {
      lines.push(`${title} · ${result.error ?? '执行失败'}`)
    }
  })
  tabs.push({
    id: 'messages',
    title: '消息',
    kind: 'message',
    message: lines.join('\n') || '没有可执行的语句',
  })
  return { tabs, activeId: tabs.find((tab) => tab.kind === 'grid')?.id ?? 'messages' }
}

const defaultSettings: AiSettingsPublic = {
  baseUrl: 'https://api.openai.com/v1',
  model: 'gpt-4o-mini',
  hasKey: false,
  encryption: 'unavailable',
}

export function WorkspaceProvider({ children }: { children: ReactNode }) {
  const api = useMemo(() => getApi(), [])
  const [ready, setReady] = useState(false)
  const [meta, setMeta] = useState<AppMeta | null>(null)
  const [connections, setConnections] = useState<ConnectionPublic[]>([])
  const [schema, setSchema] = useState<SchemaNode[]>([])
  const [search, setSearch] = useState('')
  const [expanded, setExpanded] = useState<Record<string, boolean>>({})
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [activeConnectionId, setActiveConnectionId] = useState<string | null>(null)
  const [editorTabs, setEditorTabs] = useState<EditorTabState[]>(seedTabs)
  const [activeEditorId, setActiveEditorId] = useState('query-1')
  const [resultMap, setResultMap] = useState<Record<string, ResultState>>({})
  const [running, setRunning] = useState(false)
  const [cursor, setCursor] = useState({ line: 1, column: 1 })
  const [aiTurns, setAiTurns] = useState<AiTurnState[]>([])
  const [aiStreaming, setAiStreaming] = useState(false)
  const [settings, setSettings] = useState<AiSettingsPublic | null>(null)
  const [toasts, setToasts] = useState<Toast[]>([])
  const [dialog, setDialog] = useState<DialogState>(null)
  const [sidebarWidth, setSidebarWidth] = useState(252)
  const [aiWidth, setAiWidth] = useState(360)
  const [editorRatio, setEditorRatio] = useState(1.35)
  const [sidebarOpen, setSidebarOpen] = useState(true)
  const [aiOpen, setAiOpen] = useState(true)
  const requestRef = useRef<string | null>(null)
  const loaded = useRef(false)

  const pushToast = useCallback((tone: Toast['tone'], text: string) => {
    const id = crypto.randomUUID()
    setToasts((current) => [...current.slice(-2), { id, tone, text }])
    window.setTimeout(() => {
      setToasts((current) => current.filter((toast) => toast.id !== id))
    }, tone === 'error' ? 5200 : 3200)
  }, [])

  const refreshSchema = useCallback(
    async (rows: ConnectionPublic[], preferredId?: string | null) => {
      const nodes = await Promise.all(
        rows.map(async (connection) => {
          try {
            return await api.connections.schema(connection.id)
          } catch (error) {
            const message = error instanceof Error ? error.message : '无法读取对象'
            return {
              id: connection.id,
              kind: 'connection' as const,
              name: connection.name,
              displayName: connection.name,
              dialect: connection.dialect,
              connectionId: connection.id,
              children: [
                {
                  id: `${connection.id}:error`,
                  kind: 'note' as const,
                  name: 'error',
                  displayName: message,
                  connectionId: connection.id,
                },
              ],
            }
          }
        }),
      )
      setSchema(nodes)
      setExpanded((current) => {
        const next = { ...current }
        const walk = (node: SchemaNode) => {
          if (next[node.id] === undefined) next[node.id] = true
          node.children?.forEach(walk)
        }
        nodes.forEach(walk)
        return next
      })
      setActiveConnectionId((current) => {
        const id = preferredId ?? current
        if (id && rows.some((row) => row.id === id)) return id
        return rows[0]?.id ?? null
      })
    },
    [api],
  )

  useEffect(() => {
    let cancelled = false
    void (async () => {
      try {
        const [info, rows, workspace, aiSettings] = await Promise.all([
          api.meta(),
          api.connections.list(),
          api.workspace.load(),
          api.ai.getSettings(),
        ])
        if (cancelled) return
        setMeta(info)
        setConnections(rows)
        setSettings(aiSettings)
        if (workspace) {
          setEditorTabs(workspace.editorTabs.length ? workspace.editorTabs : seedTabs())
          setActiveEditorId(workspace.activeEditorId || workspace.editorTabs[0]?.id || 'query-1')
          setAiTurns(workspace.aiTurns ?? [])
          setSidebarWidth(workspace.sidebarWidth || 252)
          setAiWidth(workspace.aiWidth || 360)
          setEditorRatio(workspace.editorRatio || 1.35)
          setSidebarOpen(workspace.sidebarOpen)
          setAiOpen(workspace.aiOpen)
          setActiveConnectionId(workspace.activeConnectionId)
        }
        await refreshSchema(rows, workspace?.activeConnectionId ?? rows[0]?.id ?? null)
        loaded.current = true
        setReady(true)
      } catch (error) {
        if (cancelled) return
        pushToast('error', error instanceof Error ? error.message : '工作区没有打开')
        setReady(true)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [api, pushToast, refreshSchema])

  useEffect(() => {
    if (!loaded.current) return
    const state: WorkspaceState = {
      version: 1,
      activeConnectionId,
      editorTabs,
      activeEditorId,
      aiTurns,
      sidebarWidth,
      aiWidth,
      editorRatio,
      sidebarOpen,
      aiOpen,
    }
    const handle = window.setTimeout(() => {
      void api.workspace.save(state)
    }, 240)
    return () => window.clearTimeout(handle)
  }, [
    api,
    activeConnectionId,
    editorTabs,
    activeEditorId,
    aiTurns,
    sidebarWidth,
    aiWidth,
    editorRatio,
    sidebarOpen,
    aiOpen,
  ])

  useEffect(() => {
    return api.ai.onEvent((event) => {
      if (event.requestId !== requestRef.current) return
      if (event.type === 'delta') {
        setAiTurns((turns) =>
          turns.map((turn) =>
            turn.id === event.requestId ? { ...turn, content: turn.content + event.delta, mode: event.mode } : turn,
          ),
        )
      }
      if (event.type === 'done') setAiStreaming(false)
      if (event.type === 'error') {
        setAiStreaming(false)
        setAiTurns((turns) =>
          turns.map((turn) =>
            turn.id === event.requestId ? { ...turn, content: turn.content || event.message } : turn,
          ),
        )
        pushToast('error', event.message)
      }
    })
  }, [api, pushToast])

  const activeConnection = connections.find((connection) => connection.id === activeConnectionId) ?? null
  const activeEditor = editorTabs.find((tab) => tab.id === activeEditorId) ?? editorTabs[0] ?? null
  const filteredSchema = useMemo(() => filterNodes(schema, search), [schema, search])

  const selectNode = (node: SchemaNode) => {
    setSelectedId(node.id)
    if (node.connectionId) setActiveConnectionId(node.connectionId)
    if (node.kind !== 'table' || !node.tableName) return
    const title = node.displayName
    const existing = editorTabs.find((tab) => tab.title === title)
    if (existing) {
      setActiveEditorId(existing.id)
      return
    }
    const id = crypto.randomUUID()
    setEditorTabs((tabs) => [...tabs, { id, title, sql: selectAll(node.tableName!) }])
    setActiveEditorId(id)
  }

  const updateSql = (sql: string) => {
    if (!activeEditor) return
    setEditorTabs((tabs) => tabs.map((tab) => (tab.id === activeEditor.id ? { ...tab, sql } : tab)))
  }

  const newTab = () => {
    const id = crypto.randomUUID()
    const count = editorTabs.length + 1
    setEditorTabs((tabs) => [...tabs, { id, title: `查询 ${count}`, sql: '' }])
    setActiveEditorId(id)
  }

  const closeTab = (id: string) => {
    const remaining = editorTabs.filter((tab) => tab.id !== id)
    if (remaining.length === 0) {
      setEditorTabs([{ id: editorTabs[0]?.id ?? id, title: '查询 1', sql: '' }])
      return
    }
    setEditorTabs(remaining)
    if (activeEditorId === id) {
      const index = editorTabs.findIndex((tab) => tab.id === id)
      setActiveEditorId(remaining[Math.max(0, index - 1)].id)
    }
    setResultMap((current) => {
      const next = { ...current }
      delete next[id]
      return next
    })
  }

  const run = async () => {
    if (!activeEditor || running) return
    if (!activeConnection) {
      pushToast('info', '先在左侧选择一个连接')
      return
    }
    setRunning(true)
    try {
      const statements = await api.sql.execute({ connectionId: activeConnection.id, sql: activeEditor.sql })
      const next = resultsFrom(statements)
      setResultMap((current) => ({ ...current, [activeEditor.id]: next }))
      const failed = statements.find((statement) => !statement.ok)
      if (failed) pushToast('error', failed.error ?? '执行失败')
      else pushToast('success', '执行完成')
    } catch (error) {
      pushToast('error', error instanceof Error ? error.message : '执行失败')
    } finally {
      setRunning(false)
    }
  }

  const sendAi = async (text?: string) => {
    const prompt = (text ?? '').trim()
    if (!prompt || aiStreaming) return
    const requestId = crypto.randomUUID()
    requestRef.current = requestId
    setAiStreaming(true)
    setAiTurns((turns) => [
      ...turns,
      { id: `${requestId}:user`, role: 'user', content: prompt },
      { id: requestId, role: 'assistant', content: '', mode: settings?.hasKey ? 'model' : 'preview' },
    ])
    try {
      await api.ai.start({ requestId, connectionId: activeConnectionId, prompt })
    } catch (error) {
      setAiStreaming(false)
      pushToast('error', error instanceof Error ? error.message : '助手没有完成这次起草')
    }
  }

  const cancelAi = () => {
    const requestId = requestRef.current
    if (!requestId) return
    void api.ai.cancel(requestId)
    setAiStreaming(false)
  }

  const applySql = (sql: string) => {
    if (!activeEditor) return
    const next = activeEditor.sql.trim() ? `${activeEditor.sql.trim()}\n\n${sql.trim()}\n` : `${sql.trim()}\n`
    updateSql(next)
    pushToast('success', '语句已写入编辑器')
  }

  const saveConnection = async (input: ConnectionInput) => {
    const saved = await api.connections.save(input)
    const rows = await api.connections.list()
    setConnections(rows)
    setDialog(null)
    await refreshSchema(rows, saved.id)
    pushToast('success', '连接已保存')
  }

  const deleteConnection = async (id: string) => {
    await api.connections.remove(id)
    const rows = await api.connections.list()
    setConnections(rows)
    setDialog(null)
    await refreshSchema(rows, activeConnectionId === id ? null : activeConnectionId)
    pushToast('success', '连接已删除')
  }

  const restoreSample = async () => {
    const saved = await api.connections.seedSample()
    const rows = await api.connections.list()
    setConnections(rows)
    await refreshSchema(rows, saved.id)
    pushToast('success', '已恢复示例业务库')
  }

  const selected = findNode(schema, selectedId)
  const breadcrumb = [activeConnection?.name, selected?.kind === 'table' ? selected.displayName : null]
    .filter(Boolean)
    .join('  /  ')

  const value: WorkspaceValue = {
    ready,
    meta,
    connections,
    schema,
    filteredSchema,
    search,
    setSearch,
    expanded,
    toggleExpanded: (id) => setExpanded((current) => ({ ...current, [id]: !current[id] })),
    selectedId,
    activeConnection,
    selectNode,
    editorTabs,
    activeEditor,
    setActiveEditor: setActiveEditorId,
    updateSql,
    newTab,
    closeTab,
    results: activeEditor ? (resultMap[activeEditor.id] ?? null) : null,
    setActiveResult: (id) => {
      if (!activeEditor) return
      setResultMap((current) => {
        const state = current[activeEditor.id]
        if (!state) return current
        return { ...current, [activeEditor.id]: { ...state, activeId: id } }
      })
    },
    running,
    run,
    cursor,
    setCursor,
    aiTurns,
    aiStreaming,
    sendAi,
    cancelAi,
    applySql,
    settings: settings ?? defaultSettings,
    saveSettings: async (input) => {
      const next = await api.ai.saveSettings(input)
      setSettings(next)
      pushToast('success', '模型配置已保存')
    },
    toasts,
    dismissToast: (id) => setToasts((current) => current.filter((toast) => toast.id !== id)),
    dialog,
    openCreate: () => setDialog({ type: 'connection' }),
    openEdit: (connection) => setDialog({ type: 'connection', connection }),
    askDelete: (connection) => setDialog({ type: 'delete', connection }),
    closeDialog: () => setDialog(null),
    saveConnection,
    deleteConnection,
    restoreSample,
    pickFile: (mode) => api.connections.pickFile(mode),
    sidebarWidth,
    aiWidth,
    editorRatio,
    setSidebarWidth,
    setAiWidth,
    setEditorRatio,
    sidebarOpen,
    aiOpen,
    toggleSidebar: () => setSidebarOpen((open) => !open),
    toggleAi: () => setAiOpen((open) => !open),
    breadcrumb: breadcrumb || '未选择连接',
  }

  return <WorkspaceContext.Provider value={value}>{children}</WorkspaceContext.Provider>
}

function findNode(nodes: SchemaNode[], id: string | null): SchemaNode | null {
  if (!id) return null
  for (const node of nodes) {
    if (node.id === id) return node
    const child = findNode(node.children ?? [], id)
    if (child) return child
  }
  return null
}

export function useWorkspace(): WorkspaceValue {
  const value = useContext(WorkspaceContext)
  if (!value) throw new Error('Workspace 尚未就绪')
  return value
}
