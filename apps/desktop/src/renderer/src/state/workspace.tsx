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
import { connectionErrorNode } from '@shared/schema'
import { changesSchema, identStyle, selectAll, selectAllWithRowid, statementTitle } from '@shared/sql'
import { INITIAL_TABS } from '@shared/session'
import { countTreeNodes, extrasFromConnections, filterNodes } from '@shared/tree'
import { dialectInfo, isKvDialect } from '@shared/types'
import { buildConnHealth, type ConnHealth } from '@shared/connHealth'
import { supportsManualTransaction } from '@shared/transaction'
import { trimAiTurns } from '@shared/aiMemory'
import { settleCancelledTurn } from '@shared/aiStream'
import type { RecentQueryItem, RecentTableItem } from '@shared/recentItems'
import { EMPTY_RECENT } from '@shared/recentItems'
import {
  isTabDisconnected,
  normalizeSessionTabs,
  pickActiveEditorId,
  SESSION_TAB_CAP,
} from '@shared/sessionRestore'
import {
  clampAiWidth,
  clampEditorRatio,
  clampSidebarWidth,
  LAYOUT,
  normalizeLayout,
} from '@shared/layoutBounds'
import { formatExplainText } from '@shared/explain'
import { analyzeDestructiveSql } from '@shared/destructiveSql'
import { analyzeReadOnlySql, isReadOnlyEffective } from '@shared/readOnlySql'
import { DEFAULT_SLOW_QUERY_MS } from '@shared/slowQuery'
import type { TableStructure } from '@shared/tableStructure'
import type { ConnectionGroup, Dialect } from '@shared/types'

export type ImportTarget = {
  connectionId: string
  tableName?: string
  dialect?: Dialect
  nonce: number
}

export type SchemaDiffSeed = {
  connectionId: string
  tableName: string
}

export type ColumnStatsTarget =
  | { source: 'result'; column: string; rows: Record<string, unknown>[] }
  | {
      source: 'table'
      connectionId: string
      tableName: string
      column: string
      dialect: Dialect
    }
import type { ImportPlanItem } from '@shared/connectionTransfer'
import type { AiIntent } from '@shared/types'
import type {
  AiSettingsPublic,
  AiTurnState,
  AppMeta,
  ConnectionInput,
  ConnectionPublic,
  EditorTabState,
  QueryHistoryEntry,
  SqlFavorite,
  SchemaNode,
  StatementResult,
  WorkspaceState,
} from '@shared/types'

export type ResultTab = {
  id: string
  title: string
  kind: 'grid' | 'message' | 'plan'
  columns?: string[]
  rows?: Record<string, unknown>[]
  message?: string
  statementIndex?: number
  rowCount?: number
}

export type ResultState = { tabs: ResultTab[]; activeId: string }

export type Toast = { id: string; tone: 'info' | 'error' | 'success'; text: string }

export type LastRunStats = {
  rows: number
  elapsedMs: number
  ok: boolean
  kind: 'run' | 'explain'
}

type DestructiveDecision = 'run' | 'skip-session' | 'cancel'

type DialogState =
  | null
  | { type: 'connection'; connection?: ConnectionPublic }
  | { type: 'delete'; connection: ConnectionPublic; inTxn?: boolean }
  | { type: 'import'; path: string; plan: ImportPlanItem[] }
  | {
      type: 'destructive'
      reasons: string[]
      preview: string
      onDecide: (decision: DestructiveDecision) => void
    }

type WorkspaceValue = {
  ready: boolean
  meta: AppMeta | null
  connections: ConnectionPublic[]
  connectionGroups: ConnectionGroup[]
  refreshConnectionGroups: () => Promise<void>
  saveConnectionGroup: (input: { id?: string; name: string }) => Promise<void>
  removeConnectionGroup: (id: string) => Promise<void>
  healthById: Record<string, ConnHealth>
  checkConnectionHealth: (id: string, silent?: boolean) => Promise<ConnHealth | null>
  checkAllConnectionHealth: () => Promise<void>
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
  tabDisconnected: (tab: EditorTabState) => boolean
  updateSql: (sql: string) => void
  newTab: () => void
  closeTab: (id: string) => void
  results: ResultState | null
  setActiveResult: (id: string) => void
  running: boolean
  lastRun: LastRunStats | null
  slowQueryMs: number
  setSlowQueryMs: (ms: number) => Promise<void>
  txnOpen: boolean
  txnSupported: boolean
  readOnlyActive: boolean
  globalReadOnly: boolean
  setGlobalReadOnly: (value: boolean) => Promise<void>
  toggleConnectionReadOnly: () => Promise<void>
  assertWritable: (action?: string) => boolean
  beginTxn: () => Promise<void>
  commitTxn: () => Promise<void>
  rollbackTxn: () => Promise<void>
  run: () => Promise<void>
  cancelRun: () => void
  explain: () => Promise<void>
  clearAiMemory: () => void
  exportConnections: () => Promise<void>
  importConnections: () => Promise<void>
  applyImportPlan: (plan: ImportPlanItem[]) => Promise<void>
  loadHistory: (connectionId: string) => Promise<QueryHistoryEntry[]>
  clearHistory: (connectionId: string) => Promise<void>
  removeHistory: (connectionId: string, entryId: string) => Promise<void>
  openHistorySql: (sql: string) => void
  rerunHistory: (sql: string) => Promise<void>
  listFavorites: () => Promise<SqlFavorite[]>
  saveFavorite: (input: {
    id?: string
    name: string
    sql: string
    connectionId?: string | null
    folderId?: string | null
  }) => Promise<void>
  removeFavorite: (id: string) => Promise<void>
  insertFavoriteSql: (sql: string) => void
  recentTables: RecentTableItem[]
  recentQueries: RecentQueryItem[]
  refreshRecent: () => Promise<void>
  clearRecent: () => Promise<void>
  openRecentTable: (item: RecentTableItem) => void
  openRecentQuery: (item: RecentQueryItem) => void
  searchStats: { connections: number; tables: number; columns: number }
  cursor: { line: number; column: number }
  setCursor: (cursor: { line: number; column: number }) => void
  aiTurns: AiTurnState[]
  aiStreaming: boolean
  aiIntent: AiIntent
  setAiIntent: (intent: AiIntent) => void
  referenceTable: string
  setReferenceTable: (table: string) => void
  targetTable: string
  setTargetTable: (table: string) => void
  tableNames: string[]
  sendAi: (text?: string) => Promise<void>
  executeAiSql: (sql: string) => Promise<void>
  repairAi: (sql: string, error: string) => Promise<void>
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
  testConnection: (input: ConnectionInput) => Promise<{ ok: boolean; error?: string }>
  deleteConnection: (id: string) => Promise<void>
  restoreSample: () => Promise<void>
  pickFile: (mode: 'open' | 'save') => Promise<string | null>
  structureTarget: { connectionId: string; tableName: string } | null
  openTableStructure: (connectionId: string, tableName: string) => void
  closeTableStructure: () => void
  openTableQuery: (connectionId: string, tableName: string) => void
  loadTableStructure: (connectionId: string, tableName: string) => Promise<TableStructure>
  columnStatsTarget: ColumnStatsTarget | null
  openColumnStats: (target: ColumnStatsTarget) => void
  closeColumnStats: () => void
  runSqlText: (sql: string) => Promise<void>
  openSqlTab: (title: string, sql: string) => void
  importTarget: ImportTarget | null
  openImportWizard: (input: { connectionId: string; tableName?: string }) => void
  closeImportWizard: () => void
  schemaDiffOpen: boolean
  schemaDiffSeed: SchemaDiffSeed | null
  openSchemaDiff: (seed?: SchemaDiffSeed | null) => void
  closeSchemaDiff: () => void
  refreshConnections: (preferredId?: string | null) => Promise<void>
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
    connectionId: null,
  }))
}

function resultsFrom(statements: StatementResult[]): ResultState {
  const tabs: ResultTab[] = []
  const lines: string[] = []
  const gridTotal = statements.filter((result) => result.ok && result.columns).length
  statements.forEach((result, index) => {
    const base = statementTitle(result.statement, index)
    if (result.ok && result.columns) {
      const rowCount = result.rows?.length ?? 0
      const title =
        gridTotal > 1 ? `${base} · ${rowCount} 行` : rowCount > 0 ? `${base} · ${rowCount} 行` : base
      tabs.push({
        id: `grid-${index}`,
        title,
        kind: 'grid',
        columns: result.columns,
        rows: result.rows ?? [],
        statementIndex: index,
        rowCount,
      })
      lines.push(`【${index + 1}】${base} · ${rowCount} 行 · ${result.elapsedMs} ms`)
    } else if (result.ok) {
      lines.push(
        `【${index + 1}】${base} · 已影响 ${result.rowsAffected ?? 0} 行 · ${result.elapsedMs} ms`,
      )
    } else {
      lines.push(`【${index + 1}】${base} · ${result.error ?? '执行失败'}`)
    }
  })
  const messageTitle = gridTotal > 1 ? `消息 · ${gridTotal} 个结果集` : '消息'
  tabs.push({
    id: 'messages',
    title: messageTitle,
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
  const [connectionGroups, setConnectionGroups] = useState<ConnectionGroup[]>([])
  const [healthById, setHealthById] = useState<Record<string, ConnHealth>>({})
  const [schema, setSchema] = useState<SchemaNode[]>([])
  const [search, setSearch] = useState('')
  const [expanded, setExpanded] = useState<Record<string, boolean>>({})
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [activeConnectionId, setActiveConnectionId] = useState<string | null>(null)
  const [editorTabs, setEditorTabs] = useState<EditorTabState[]>(seedTabs)
  const [activeEditorId, setActiveEditorId] = useState('query-1')
  const [resultMap, setResultMap] = useState<Record<string, ResultState>>({})
  const [running, setRunning] = useState(false)
  const [txnOpen, setTxnOpen] = useState(false)
  const [txnSupported, setTxnSupported] = useState(false)
  const [lastRun, setLastRun] = useState<LastRunStats | null>(null)
  const [cursor, setCursor] = useState({ line: 1, column: 1 })
  const [aiTurns, setAiTurns] = useState<AiTurnState[]>([])
  const [aiStreaming, setAiStreaming] = useState(false)
  const [aiIntent, setAiIntent] = useState<AiIntent>('query')
  const [referenceTable, setReferenceTable] = useState('')
  const [targetTable, setTargetTable] = useState('')
  const [recentTables, setRecentTables] = useState<RecentTableItem[]>([])
  const [recentQueries, setRecentQueries] = useState<RecentQueryItem[]>([])
  const [settings, setSettings] = useState<AiSettingsPublic | null>(null)
  const [toasts, setToasts] = useState<Toast[]>([])
  const [dialog, setDialog] = useState<DialogState>(null)
  const [structureTarget, setStructureTarget] = useState<{ connectionId: string; tableName: string } | null>(null)
  const [columnStatsTarget, setColumnStatsTarget] = useState<ColumnStatsTarget | null>(null)
  const [importTarget, setImportTarget] = useState<ImportTarget | null>(null)
  const [schemaDiffOpen, setSchemaDiffOpen] = useState(false)
  const [schemaDiffSeed, setSchemaDiffSeed] = useState<SchemaDiffSeed | null>(null)
  const [sidebarWidth, setSidebarWidthState] = useState<number>(LAYOUT.sidebarDefault)
  const [aiWidth, setAiWidthState] = useState<number>(LAYOUT.aiDefault)
  const [editorRatio, setEditorRatioState] = useState<number>(LAYOUT.editorRatioDefault)
  const setSidebarWidth = useCallback((value: number) => {
    setSidebarWidthState(clampSidebarWidth(value))
  }, [])
  const setAiWidth = useCallback((value: number) => {
    setAiWidthState(clampAiWidth(value))
  }, [])
  const setEditorRatio = useCallback((value: number) => {
    setEditorRatioState(clampEditorRatio(value))
  }, [])
  const [globalReadOnly, setGlobalReadOnlyState] = useState(false)
  const [slowQueryMs, setSlowQueryMsState] = useState(DEFAULT_SLOW_QUERY_MS)
  const [sidebarOpen, setSidebarOpen] = useState(true)
  const [aiOpen, setAiOpen] = useState(true)
  const requestRef = useRef<string | null>(null)
  const sqlRequestRef = useRef<string | null>(null)
  const skipDestructiveRef = useRef(false)
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
            return connectionErrorNode(connection.id, connection.name, connection.dialect, message)
          }
        }),
      )
      setSchema(nodes)
      setExpanded((current) => {
        const next = { ...current }
        const walk = (node: SchemaNode) => {
          if (next[node.id] === undefined) next[node.id] = node.kind !== 'table'
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
        const [info, rows, workspace, aiSettings, recent, prefs, groups] = await Promise.all([
          api.meta(),
          api.connections.list(),
          api.workspace.load(),
          api.ai.getSettings(),
          api.recent.list().catch(() => EMPTY_RECENT),
          api.prefs.get(),
          api.connections.listGroups().catch(() => []),
        ])
        if (cancelled) return
        setMeta(info)
        setConnections(rows)
        setConnectionGroups(groups)
        setSettings(aiSettings)
        applyRecentState(recent)
        setGlobalReadOnlyState(Boolean(prefs.globalReadOnly))
        setSlowQueryMsState(prefs.slowQueryMs ?? DEFAULT_SLOW_QUERY_MS)
        const connectionIds = new Set(rows.map((row) => row.id))
        let restoreConnectionId = workspace?.activeConnectionId ?? rows[0]?.id ?? null
        if (workspace) {
          setAiTurns(trimAiTurns(workspace.aiTurns ?? []))
          {
            const layout = normalizeLayout(workspace)
            setSidebarWidthState(layout.sidebarWidth)
            setAiWidthState(layout.aiWidth)
            setEditorRatioState(layout.editorRatio)
            setSidebarOpen(layout.sidebarOpen)
            setAiOpen(layout.aiOpen)
          }
          if (prefs.restoreTabsOnLaunch !== false && workspace.editorTabs.length > 0) {
            const tabs = normalizeSessionTabs(workspace.editorTabs, SESSION_TAB_CAP)
            setEditorTabs(tabs.length ? tabs : seedTabs())
            setActiveEditorId(pickActiveEditorId(tabs.length ? tabs : seedTabs(), workspace.activeEditorId))
            const activeTab = tabs.find((tab) => tab.id === pickActiveEditorId(tabs, workspace.activeEditorId))
            if (activeTab?.connectionId && connectionIds.has(activeTab.connectionId)) {
              restoreConnectionId = activeTab.connectionId
            } else if (workspace.activeConnectionId && connectionIds.has(workspace.activeConnectionId)) {
              restoreConnectionId = workspace.activeConnectionId
            } else {
              restoreConnectionId = rows[0]?.id ?? null
            }
          } else {
            setEditorTabs(seedTabs())
            setActiveEditorId('query-1')
            if (workspace.activeConnectionId && connectionIds.has(workspace.activeConnectionId)) {
              restoreConnectionId = workspace.activeConnectionId
            } else {
              restoreConnectionId = rows[0]?.id ?? null
            }
          }
          setActiveConnectionId(restoreConnectionId)
        }
        await refreshSchema(rows, restoreConnectionId)
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
      editorTabs: normalizeSessionTabs(editorTabs, SESSION_TAB_CAP),
      activeEditorId,
      aiTurns: trimAiTurns(aiTurns),
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
      if (event.type === 'progress') {
        setAiTurns((turns) =>
          turns.map((turn) =>
            turn.id === event.requestId
              ? {
                  ...turn,
                  mode: event.mode,
                  steps: [...(turn.steps ?? []), { step: event.step, detail: event.detail }],
                }
              : turn,
          ),
        )
        return
      }
      if (event.type === 'delta') {
        setAiTurns((turns) =>
          turns.map((turn) =>
            turn.id === event.requestId ? { ...turn, content: turn.content + event.delta, mode: event.mode } : turn,
          ),
        )
        return
      }
      if (event.type === 'done') {
        setAiStreaming(false)
        if (requestRef.current === event.requestId) requestRef.current = null
        setAiTurns((turns) =>
          turns.map((turn) => {
            if (turn.id !== event.requestId) return turn
            if (event.cancelled) return settleCancelledTurn({ ...turn, mode: event.mode })
            return { ...turn, mode: event.mode, status: 'done' }
          }),
        )
        if (event.cancelled) pushToast('info', '已停止生成')
        return
      }
      if (event.type === 'error') {
        setAiStreaming(false)
        if (requestRef.current === event.requestId) requestRef.current = null
        setAiTurns((turns) =>
          turns.map((turn) =>
            turn.id === event.requestId
              ? { ...turn, content: turn.content || event.message, status: 'error' }
              : turn,
          ),
        )
        pushToast('error', event.message)
      }
    })
  }, [api, pushToast])

  const activeConnection = connections.find((connection) => connection.id === activeConnectionId) ?? null
  const activeEditor = editorTabs.find((tab) => tab.id === activeEditorId) ?? editorTabs[0] ?? null
  const filteredSchema = useMemo(
    () => filterNodes(schema, search, extrasFromConnections(connections)),
    [schema, search, connections],
  )
  const searchStats = useMemo(() => countTreeNodes(filteredSchema), [filteredSchema])


  const applyRecentState = (state: { tables: RecentTableItem[]; queries: RecentQueryItem[] }) => {
    setRecentTables(state.tables)
    setRecentQueries(state.queries)
  }

  const refreshRecent = useCallback(async () => {
    try {
      const state = await api.recent.list()
      applyRecentState(state)
    } catch {
      applyRecentState(EMPTY_RECENT)
    }
  }, [api])

  const recordTableRecent = useCallback(
    async (connectionId: string, tableName: string) => {
      const connection = connections.find((item) => item.id === connectionId)
      try {
        const state = await api.recent.recordTable({
          connectionId,
          connectionName: connection?.name ?? '',
          tableName,
        })
        applyRecentState(state)
      } catch {
        /* ignore */
      }
    },
    [api, connections],
  )

  const recordQueryRecent = useCallback(
    async (sql: string, connectionId: string | null) => {
      const trimmed = sql.trim()
      if (!trimmed) return
      const connection = connectionId ? connections.find((item) => item.id === connectionId) : null
      try {
        const state = await api.recent.recordQuery({
          connectionId,
          connectionName: connection?.name ?? '',
          sql: trimmed,
        })
        applyRecentState(state)
      } catch {
        /* ignore */
      }
    },
    [api, connections],
  )

  const clearRecent = useCallback(async () => {
    try {
      const state = await api.recent.clear()
      applyRecentState(state)
      pushToast('success', '已清空最近记录')
    } catch (error) {
      pushToast('error', error instanceof Error ? error.message : '清空失败')
    }
  }, [api, pushToast])

  const openTableStructure = (connectionId: string, tableName: string) => {
    setActiveConnectionId(connectionId)
    setStructureTarget({ connectionId, tableName })
    void recordTableRecent(connectionId, tableName)
  }

  const closeTableStructure = () => setStructureTarget(null)

  const openTableQuery = (connectionId: string, tableName: string) => {
    setActiveConnectionId(connectionId)
    const connection = connections.find((item) => item.id === connectionId)
    const dialect = connection?.dialect ?? 'sqlite'
    if (dialect === 'redis') return
    void recordTableRecent(connectionId, tableName)
    const title = tableName
    const existing = editorTabs.find((tab) => tab.title === title)
    if (existing) {
      setActiveEditorId(existing.id)
      setTargetTable(tableName)
      return
    }
    const id = crypto.randomUUID()
    const sql = dialect === 'sqlite' ? selectAllWithRowid(tableName) : selectAll(tableName, identStyle(dialect))
    setEditorTabs((tabs) => [...tabs, { id, title, sql, connectionId }])
    setActiveEditorId(id)
    setTargetTable(tableName)
  }

  const openRecentTable = (item: RecentTableItem) => {
    openTableQuery(item.connectionId, item.tableName)
  }

  const openRecentQuery = (item: RecentQueryItem) => {
    if (item.connectionId) setActiveConnectionId(item.connectionId)
    openHistorySql(item.sql)
  }

  const loadTableStructure = async (connectionId: string, tableName: string) =>
    api.sql.tableStructure({ connectionId, table: tableName })

  const openColumnStats = (target: ColumnStatsTarget) => setColumnStatsTarget(target)
  const closeColumnStats = () => setColumnStatsTarget(null)

  const openImportWizard = (input: { connectionId: string; tableName?: string }) => {
    const connection = connections.find((item) => item.id === input.connectionId)
    if (isReadOnlyEffective(globalReadOnly, connection?.readOnly)) {
      pushToast('info', '只读模式已开启，已拦截数据导入。')
      return
    }
    setActiveConnectionId(input.connectionId)
    setImportTarget({
      connectionId: input.connectionId,
      tableName: input.tableName,
      dialect: connection?.dialect,
      nonce: Date.now(),
    })
  }

  const closeImportWizard = () => setImportTarget(null)

  const openSchemaDiff = (seed?: SchemaDiffSeed | null) => {
    setSchemaDiffSeed(seed ?? null)
    setSchemaDiffOpen(true)
  }

  const closeSchemaDiff = () => {
    setSchemaDiffOpen(false)
    setSchemaDiffSeed(null)
  }

  const refreshConnectionGroups = async () => {
    try {
      setConnectionGroups(await api.connections.listGroups())
    } catch {
      setConnectionGroups([])
    }
  }

  const saveConnectionGroup = async (input: { id?: string; name: string }) => {
    await api.connections.saveGroup(input)
    await refreshConnectionGroups()
    pushToast('success', input.id ? '分组已更新' : '分组已创建')
  }

  const removeConnectionGroup = async (id: string) => {
    await api.connections.removeGroup(id)
    const rows = await api.connections.list()
    setConnections(rows)
    await refreshConnectionGroups()
    pushToast('success', '分组已删除')
  }

  const refreshConnections = async (preferredId?: string | null) => {
    const rows = await api.connections.list()
    setConnections(rows)
    await refreshSchema(rows, preferredId ?? activeConnectionId)
    pushToast('success', '导入完成，对象树已刷新')
  }


  const openSqlTab = (title: string, sql: string) => {
    const id = crypto.randomUUID()
    setEditorTabs((tabs) => [
      ...tabs,
      { id, title, sql, connectionId: activeConnectionId },
    ])
    setActiveEditorId(id)
  }


  const checkConnectionHealth = async (id: string, silent = true): Promise<ConnHealth | null> => {
    const connection = connections.find((row) => row.id === id)
    if (!connection) return null
    try {
      const raw = await api.connections.health(id)
      const health = buildConnHealth(raw)
      setHealthById((current) => ({ ...current, [id]: health }))
      if (!silent) {
        if (health.unsupported) pushToast('info', health.error ?? '暂不支持探测')
        else if (health.ok) pushToast('success', `延迟 ${health.latencyMs} ms`)
        else pushToast('error', health.error ?? '探测失败')
      }
      return health
    } catch (error) {
      const health = buildConnHealth({
        ok: false,
        latencyMs: 0,
        error: error instanceof Error ? error.message : '探测失败',
      })
      setHealthById((current) => ({ ...current, [id]: health }))
      if (!silent) pushToast('error', health.error ?? '探测失败')
      return health
    }
  }

  const checkAllConnectionHealth = async () => {
    const rows = connections.filter((row) => {
      const info = dialectInfo(row.dialect)
      return info.executable || Boolean(info.kv)
    })
    await Promise.all(rows.map((row) => checkConnectionHealth(row.id, true)))
    pushToast('success', `已检测 ${rows.length} 个连接`)
  }

  const selectNode = (node: SchemaNode) => {
    setSelectedId(node.id)
    if (node.connectionId) {
      setActiveConnectionId(node.connectionId)
      if (node.kind === 'connection') void checkConnectionHealth(node.connectionId, true)
    }
    if (node.kind === 'key' && node.redisKey) {
      setAiOpen(true)
      return
    }
    if (node.kind !== 'table' || !node.tableName) return
    const title = node.displayName
    const existing = editorTabs.find((tab) => tab.title === title)
    if (existing) {
      setActiveEditorId(existing.id)
      return
    }
    const dialect = node.dialect ?? connections.find((item) => item.id === node.connectionId)?.dialect ?? 'sqlite'
    const id = crypto.randomUUID()
    const sql = dialect === 'sqlite' ? selectAllWithRowid(node.tableName!) : selectAll(node.tableName!, identStyle(dialect))
    setEditorTabs((tabs) => [
      ...tabs,
      { id, title, sql, connectionId: node.connectionId },
    ])
    setActiveEditorId(id)
    if (dialect !== 'redis') setTargetTable(node.tableName!)
  }

  const updateSql = (sql: string) => {
    if (!activeEditor) return
    setEditorTabs((tabs) => tabs.map((tab) => (tab.id === activeEditor.id ? { ...tab, sql } : tab)))
  }

  const newTab = () => {
    const id = crypto.randomUUID()
    const count = editorTabs.length + 1
    setEditorTabs((tabs) => [
      ...tabs,
      { id, title: `查询 ${count}`, sql: '', connectionId: activeConnectionId },
    ])
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

  const confirmIfDestructive = async (sql: string): Promise<boolean> => {
    if (skipDestructiveRef.current) return true
    const analysis = analyzeDestructiveSql(sql)
    if (!analysis.destructive) return true
    return await new Promise<boolean>((resolve) => {
      setDialog({
        type: 'destructive',
        reasons: [...new Set(analysis.hits.map((hit) => hit.summary))],
        preview: sql.trim().slice(0, 320),
        onDecide: (decision: DestructiveDecision) => {
          setDialog(null)
          if (decision === 'skip-session') skipDestructiveRef.current = true
          resolve(decision !== 'cancel')
        },
      })
    })
  }


  const readOnlyActive = isReadOnlyEffective(globalReadOnly, activeConnection?.readOnly)

  const assertWritable = useCallback(
    (action = '写操作') => {
      if (!isReadOnlyEffective(globalReadOnly, activeConnection?.readOnly)) return true
      pushToast('info', `只读模式已开启，已拦截${action}。SELECT / EXPLAIN / 导出仍可用。`)
      return false
    },
    [globalReadOnly, activeConnection?.readOnly, pushToast],
  )

  const setGlobalReadOnly = useCallback(
    async (value: boolean) => {
      const next = await api.prefs.save({ globalReadOnly: value })
      setGlobalReadOnlyState(next.globalReadOnly === true)
      pushToast('success', next.globalReadOnly ? '已开启全局只读' : '已关闭全局只读')
    },
    [api, pushToast],
  )

  const setSlowQueryMs = useCallback(
    async (ms: number) => {
      const next = await api.prefs.save({ slowQueryMs: ms })
      setSlowQueryMsState(next.slowQueryMs)
      pushToast('success', `慢查询阈值已设为 ${next.slowQueryMs} ms`)
    },
    [api, pushToast],
  )

  const toggleConnectionReadOnly = useCallback(async () => {
    if (!activeConnection) {
      pushToast('info', '先选择一个连接')
      return
    }
    const nextFlag = !activeConnection.readOnly
    await api.connections.save({
      id: activeConnection.id,
      name: activeConnection.name,
      dialect: activeConnection.dialect,
      filePath: activeConnection.filePath,
      host: activeConnection.host,
      port: activeConnection.port,
      database: activeConnection.database,
      username: activeConnection.username,
      readOnly: nextFlag,
    })
    const rows = await api.connections.list()
    setConnections(rows)
    pushToast('success', nextFlag ? `「${activeConnection.name}」已设为只读` : `「${activeConnection.name}」已允许写入`)
  }, [activeConnection, api, pushToast])

  const runSqlText = async (sql: string) => {
    if (running) return
    if (!activeConnection) {
      pushToast('info', '先在左侧选择一个连接')
      return
    }
    if (isKvDialect(activeConnection.dialect)) {
      pushToast('info', 'Redis 请使用键浏览器，而不是 SQL 运行')
      return
    }
    const readOnlyHit = analyzeReadOnlySql(sql)
    if (readOnlyActive && readOnlyHit.blocked) {
      pushToast('info', readOnlyHit.reason)
      return
    }
    if (!(await confirmIfDestructive(sql))) {
      pushToast('info', '已取消执行')
      return
    }
    const requestId = crypto.randomUUID()
    sqlRequestRef.current = requestId
    setRunning(true)
    try {
      const prefs = await api.prefs.get()
      const timeoutMs = prefs.queryTimeoutSec > 0 ? prefs.queryTimeoutSec * 1000 : 0
      const statements = await api.sql.execute({
        connectionId: activeConnection.id,
        sql,
        requestId,
        timeoutMs,
      })
      const next = resultsFrom(statements)
      const elapsedMs = statements.reduce((sum, item) => sum + (item.elapsedMs || 0), 0)
      const rowCount = statements.reduce((sum, item) => sum + (item.rows?.length ?? 0), 0)
      setLastRun({ rows: rowCount, elapsedMs, ok: statements.every((item) => item.ok), kind: 'run' })
      if (activeEditor) setResultMap((current) => ({ ...current, [activeEditor.id]: next }))
      const failed = statements.find((statement) => !statement.ok)
      if (failed) {
        pushToast('error', failed.error ?? '执行失败')
      } else {
        pushToast('success', '执行完成')
        void recordQueryRecent(sql, activeConnection.id)
        if (activeEditor) {
          setEditorTabs((tabs) =>
            tabs.map((tab) =>
              tab.id === activeEditor.id ? { ...tab, connectionId: activeConnection.id } : tab,
            ),
          )
        }
      }
      if (statements.some((statement) => statement.ok && changesSchema(statement.statement))) {
        const rows = await api.connections.list()
        setConnections(rows)
        await refreshSchema(rows, activeConnection.id)
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : '执行失败'
      if (/查询已取消|查询已超时/.test(message)) {
        setLastRun({ rows: 0, elapsedMs: 0, ok: false, kind: 'run' })
        pushToast('info', message)
      } else {
        pushToast('error', message)
      }
    } finally {
      if (sqlRequestRef.current === requestId) sqlRequestRef.current = null
      setRunning(false)
    }
  }



  const refreshTxnStatus = async (connectionId?: string | null) => {
    const id = connectionId === undefined ? activeConnectionId : connectionId
    if (!id) {
      setTxnOpen(false)
      setTxnSupported(false)
      return
    }
    const conn = connections.find((c) => c.id === id)
    if (!conn || !supportsManualTransaction(conn.dialect)) {
      setTxnOpen(false)
      setTxnSupported(false)
      return
    }
    try {
      const status = await api.sql.txnStatus(id)
      setTxnOpen(status.open)
      setTxnSupported(status.supported)
    } catch {
      setTxnOpen(false)
      setTxnSupported(supportsManualTransaction(conn.dialect))
    }
  }

  const beginTxn = async () => {
    if (!assertWritable('开始事务')) return
    if (!activeConnection) {
      pushToast('info', '先在左侧选择一个连接')
      return
    }
    if (!supportsManualTransaction(activeConnection.dialect)) {
      pushToast('info', '当前数据库类型不支持手动事务')
      return
    }
    try {
      const status = await api.sql.beginTxn(activeConnection.id)
      setTxnOpen(status.open)
      setTxnSupported(status.supported)
      pushToast('success', '已开始事务（自动提交已关闭）')
    } catch (error) {
      pushToast('error', error instanceof Error ? error.message : '开始事务失败')
    }
  }

  const commitTxn = async () => {
    if (!activeConnection) {
      pushToast('info', '先在左侧选择一个连接')
      return
    }
    try {
      const status = await api.sql.commitTxn(activeConnection.id)
      setTxnOpen(status.open)
      setTxnSupported(status.supported)
      pushToast('success', '事务已提交')
    } catch (error) {
      pushToast('error', error instanceof Error ? error.message : '提交失败')
      await refreshTxnStatus(activeConnection.id)
    }
  }

  const rollbackTxn = async () => {
    if (!activeConnection) {
      pushToast('info', '先在左侧选择一个连接')
      return
    }
    try {
      const status = await api.sql.rollbackTxn(activeConnection.id)
      setTxnOpen(status.open)
      setTxnSupported(status.supported)
      pushToast('info', '事务已回滚')
    } catch (error) {
      pushToast('error', error instanceof Error ? error.message : '回滚失败')
      await refreshTxnStatus(activeConnection.id)
    }
  }

  const cancelRun = () => {
    const requestId = sqlRequestRef.current
    if (!requestId) return
    void api.sql.cancel(requestId)
    void refreshTxnStatus(activeConnectionId).then(() => undefined)
  }

  const run = async () => {
    if (!activeEditor || running) return
    if (!activeConnection) {
      pushToast('info', '先在左侧选择一个连接')
      return
    }
    if (isKvDialect(activeConnection.dialect)) {
      pushToast('info', 'Redis 请使用键浏览器，而不是 SQL 运行')
      return
    }
    const sql = activeEditor.sql
    if (!(await confirmIfDestructive(sql))) {
      pushToast('info', '已取消执行')
      return
    }
    const requestId = crypto.randomUUID()
    sqlRequestRef.current = requestId
    setRunning(true)
    try {
      const prefs = await api.prefs.get()
      const timeoutMs = prefs.queryTimeoutSec > 0 ? prefs.queryTimeoutSec * 1000 : 0
      const statements = await api.sql.execute({
        connectionId: activeConnection.id,
        sql,
        requestId,
        timeoutMs,
      })
      const next = resultsFrom(statements)
      const elapsedMs = statements.reduce((sum, item) => sum + (item.elapsedMs || 0), 0)
      const rowCount = statements.reduce((sum, item) => sum + (item.rows?.length ?? 0), 0)
      setLastRun({ rows: rowCount, elapsedMs, ok: statements.every((item) => item.ok), kind: 'run' })
      setResultMap((current) => ({ ...current, [activeEditor.id]: next }))
      const failed = statements.find((statement) => !statement.ok)
      if (failed) {
        pushToast('error', failed.error ?? '执行失败')
        void repairAi(failed.statement || sql, failed.error ?? '执行失败')
      } else pushToast('success', '执行完成')
      if (statements.some((statement) => statement.ok && changesSchema(statement.statement))) {
        const rows = await api.connections.list()
        setConnections(rows)
        await refreshSchema(rows, activeConnection.id)
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : '执行失败'
      if (/查询已取消|查询已超时/.test(message)) {
        setLastRun({ rows: 0, elapsedMs: 0, ok: false, kind: 'run' })
        pushToast('info', message)
      } else {
        pushToast('error', message)
      }
    } finally {
      if (sqlRequestRef.current === requestId) sqlRequestRef.current = null
      setRunning(false)
    }
  }

  const explain = async () => {
    if (!activeEditor || running) return
    if (!activeConnection) {
      pushToast('info', '先在左侧选择一个连接')
      return
    }
    if (isKvDialect(activeConnection.dialect)) {
      pushToast('info', 'Redis 不支持 SQL 执行计划')
      return
    }
    const requestId = crypto.randomUUID()
    sqlRequestRef.current = requestId
    setRunning(true)
    try {
      const prefs = await api.prefs.get()
      const timeoutMs = prefs.queryTimeoutSec > 0 ? prefs.queryTimeoutSec * 1000 : 0
      const statements = await api.sql.explain({
        connectionId: activeConnection.id,
        sql: activeEditor.sql,
        requestId,
        timeoutMs,
      })
      const planTab: ResultTab = {
        id: 'explain-plan',
        title: '执行计划',
        kind: 'plan',
        message: statements
          .map((result, index) => {
            if (!result.ok) return `【${index + 1}】${result.error ?? '失败'}`
            if (result.columns && result.rows) return formatExplainText(result.columns, result.rows)
            return result.statement || `计划 ${index + 1}`
          })
          .join('\n\n'),
      }
      const gridTabs: ResultTab[] = []
      statements.forEach((result, index) => {
        if (result.ok && result.columns) {
          gridTabs.push({
            id: `explain-grid-${index}`,
            title: gridTabs.length === 0 ? '计划表' : `计划表 ${gridTabs.length + 1}`,
            kind: 'grid',
            columns: result.columns,
            rows: result.rows ?? [],
          })
        }
      })
      const messageTab: ResultTab = {
        id: 'messages',
        title: '消息',
        kind: 'message',
        message: statements
          .map((result, index) => {
            if (!result.ok) return `计划 ${index + 1} · ${result.error ?? '失败'}`
            return `计划 ${index + 1} · ${result.rows?.length ?? 0} 行 · ${result.elapsedMs} ms`
          })
          .join('\n'),
      }
      const next: ResultState = {
        tabs: [planTab, ...gridTabs, messageTab],
        activeId: planTab.id,
      }
      setResultMap((current) => ({ ...current, [activeEditor.id]: next }))
      const elapsedMs = statements.reduce((sum, item) => sum + (item.elapsedMs || 0), 0)
      const rows = statements.reduce((sum, item) => sum + (item.rows?.length ?? 0), 0)
      setLastRun({ rows, elapsedMs, ok: !statements.some((item) => !item.ok), kind: 'explain' })
      const failed = statements.find((statement) => !statement.ok)
      if (failed) pushToast('error', failed.error ?? '执行计划失败')
      else pushToast('success', '已生成执行计划')
    } catch (error) {
      const message = error instanceof Error ? error.message : '执行计划失败'
      if (/查询已取消|查询已超时/.test(message)) {
        setLastRun({ rows: 0, elapsedMs: 0, ok: false, kind: 'explain' })
        pushToast('info', message)
      } else {
        pushToast('error', message)
      }
    } finally {
      if (sqlRequestRef.current === requestId) sqlRequestRef.current = null
      setRunning(false)
    }
  }

  const clearAiMemory = () => {
    setAiTurns([])
    pushToast('success', '已清空助手会话')
  }

  const exportConnections = async () => {
    const result = await api.connections.exportBundle()
    if (!result.path) {
      pushToast('info', '已取消导出')
      return
    }
    pushToast('success', `已导出 ${result.count} 个连接`)
  }

  const importConnections = async () => {
    const result = await api.connections.importPreview()
    if ('cancelled' in result) {
      pushToast('info', '已取消导入')
      return
    }
    if ('error' in result) {
      pushToast('error', result.error)
      return
    }
    setDialog({ type: 'import', path: result.path, plan: result.plan })
  }

  const applyImportPlan = async (plan: ImportPlanItem[]) => {
    const result = await api.connections.importApply(plan)
    setConnections(result.connections)
    setDialog(null)
    await refreshSchema(result.connections, activeConnectionId)
    pushToast('success', `已导入 ${result.imported} 个连接`)
  }

  const tableNames = useMemo(() => {
    const names: string[] = []
    const walk = (nodes: SchemaNode[]) => {
      for (const node of nodes) {
        if (node.kind === 'table' && node.tableName) names.push(node.tableName)
        if (node.children) walk(node.children)
      }
    }
    walk(schema)
    return names
  }, [schema])

  const sendAi = async (text?: string) => {
    const prompt = (text ?? '').trim()
    if (!prompt || aiStreaming) return
    const requestId = crypto.randomUUID()
    requestRef.current = requestId
    setAiOpen(true)
    setAiStreaming(true)
    const history = aiTurns
      .slice(-6)
      .map((turn) => `${turn.role === 'user' ? '用户' : '助手'}: ${turn.content.slice(0, 240)}`)
      .join('\n')
    setAiTurns((turns) => [
      ...turns,
      { id: `${requestId}:user`, role: 'user', content: prompt },
      { id: requestId, role: 'assistant', content: '', mode: settings?.hasKey ? 'model' : 'preview', steps: [], status: 'streaming' },
    ])
    try {
      await api.ai.start({
        requestId,
        connectionId: activeConnectionId,
        prompt,
        intent: aiIntent,
        referenceTable: referenceTable || undefined,
        targetTable: targetTable || undefined,
        history,
      })
    } catch (error) {
      setAiStreaming(false)
      pushToast('error', error instanceof Error ? error.message : '助手没有完成这次起草')
    }
  }

  const executeAiSql = async (sql: string) => {
    if (!activeConnection) {
      pushToast('info', '先选择一个连接')
      return
    }
    if (isKvDialect(activeConnection.dialect)) {
      pushToast('info', 'Redis 不支持执行 SQL')
      return
    }
    const readOnlyHit = analyzeReadOnlySql(sql)
    if (readOnlyActive && readOnlyHit.blocked) {
      pushToast('info', readOnlyHit.reason)
      return
    }
    applySql(sql)
    if (!(await confirmIfDestructive(sql))) {
      pushToast('info', '已取消执行')
      return
    }
    const requestId = crypto.randomUUID()
    sqlRequestRef.current = requestId
    setRunning(true)
    try {
      const prefs = await api.prefs.get()
      const timeoutMs = prefs.queryTimeoutSec > 0 ? prefs.queryTimeoutSec * 1000 : 0
      const statements = await api.sql.execute({
        connectionId: activeConnection.id,
        sql,
        requestId,
        timeoutMs,
      })
      const next = resultsFrom(statements)
      if (activeEditor) setResultMap((current) => ({ ...current, [activeEditor.id]: next }))
      const failed = statements.find((statement) => !statement.ok)
      if (failed) {
        pushToast('error', failed.error ?? '执行失败')
        void repairAi(failed.statement || sql, failed.error ?? '执行失败')
      } else {
        pushToast('success', '已执行')
        if (statements.some((statement) => statement.ok && changesSchema(statement.statement))) {
          const rows = await api.connections.list()
          setConnections(rows)
          await refreshSchema(rows, activeConnection.id)
        }
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : '执行失败'
      if (/查询已取消|查询已超时/.test(message)) pushToast('info', message)
      else pushToast('error', message)
    } finally {
      if (sqlRequestRef.current === requestId) sqlRequestRef.current = null
      setRunning(false)
    }
  }

  const repairAi = async (sql: string, error: string) => {
    if (aiStreaming) return
    const requestId = crypto.randomUUID()
    requestRef.current = requestId
    setAiOpen(true)
    setAiStreaming(true)
    setAiTurns((turns) => [
      ...turns,
      { id: `${requestId}:user`, role: 'user', content: `修复失败 SQL：${error}` },
      { id: requestId, role: 'assistant', content: '', mode: settings?.hasKey ? 'model' : 'preview', steps: [], status: 'streaming' },
    ])
    try {
      await api.ai.repair({ requestId, connectionId: activeConnectionId, sql, error })
    } catch (reason) {
      setAiStreaming(false)
      pushToast('error', reason instanceof Error ? reason.message : '助手没有完成修复')
    }
  }

  const cancelAi = () => {
    const requestId = requestRef.current
    if (!requestId) return
    void api.ai.cancel(requestId)
    requestRef.current = null
    setAiStreaming(false)
    setAiTurns((turns) =>
      turns.map((turn) => (turn.id === requestId ? settleCancelledTurn(turn) : turn)),
    )
    pushToast('info', '已停止生成')
  }

  const applySql = (sql: string) => {
    if (!activeEditor) return
    const next = activeEditor.sql.trim() ? `${activeEditor.sql.trim()}\n\n${sql.trim()}\n` : `${sql.trim()}\n`
    updateSql(next)
    pushToast('success', '语句已写入编辑器')
  }



  const listFavorites = async () => api.favorites.list()

  const saveFavorite = async (input: {
    id?: string
    name: string
    sql: string
    connectionId?: string | null
    folderId?: string | null
  }) => {
    await api.favorites.save(input)
    void recordQueryRecent(input.sql, input.connectionId ?? activeConnectionId)
    pushToast('success', input.id ? '片段已更新' : '片段已收藏')
  }

  const removeFavorite = async (id: string) => {
    await api.favorites.remove(id)
    pushToast('success', '已删除片段')
  }

  const insertFavoriteSql = (sql: string) => {
    if (!activeEditor) {
      const id = crypto.randomUUID()
      setEditorTabs((tabs) => [
        ...tabs,
        { id, title: `查询 ${tabs.length + 1}`, sql, connectionId: activeConnectionId },
      ])
      setActiveEditorId(id)
    } else {
      const next = activeEditor.sql.trim() ? `${activeEditor.sql.trim()}

${sql.trim()}
` : `${sql.trim()}
`
      updateSql(next)
    }
    pushToast('success', '片段已插入编辑器')
  }

  const loadHistory = async (connectionId: string) => api.history.list(connectionId)

  const clearHistory = async (connectionId: string) => {
    await api.history.clear(connectionId)
    pushToast('success', '已清空查询历史')
  }

  const removeHistory = async (connectionId: string, entryId: string) => {
    await api.history.remove(connectionId, entryId)
  }

  const openHistorySql = (sql: string) => {
    const id = crypto.randomUUID()
    setEditorTabs((tabs) => [
      ...tabs,
      { id, title: `历史 ${tabs.length + 1}`, sql, connectionId: activeConnectionId },
    ])
    setActiveEditorId(id)
    pushToast('success', '已打开历史语句')
  }

  const rerunHistory = async (sql: string) => {
    if (!activeConnection) {
      pushToast('info', '先选择一个连接')
      return
    }
    if (isKvDialect(activeConnection.dialect)) {
      pushToast('info', 'Redis 请使用键浏览器，而不是 SQL 运行')
      return
    }
    const id = crypto.randomUUID()
    setEditorTabs((tabs) => [
      ...tabs,
      { id, title: `历史 ${tabs.length + 1}`, sql, connectionId: activeConnectionId },
    ])
    setActiveEditorId(id)
    if (!(await confirmIfDestructive(sql))) {
      pushToast('info', '已取消执行')
      return
    }
    const requestId = crypto.randomUUID()
    sqlRequestRef.current = requestId
    setRunning(true)
    try {
      const prefs = await api.prefs.get()
      const timeoutMs = prefs.queryTimeoutSec > 0 ? prefs.queryTimeoutSec * 1000 : 0
      const statements = await api.sql.execute({
        connectionId: activeConnection.id,
        sql,
        requestId,
        timeoutMs,
      })
      const next = resultsFrom(statements)
      setResultMap((current) => ({ ...current, [id]: next }))
      const failed = statements.find((statement) => !statement.ok)
      if (failed) {
        pushToast('error', failed.error ?? '执行失败')
        void repairAi(failed.statement || sql, failed.error ?? '执行失败')
      } else {
        pushToast('success', '已重新运行')
        if (statements.some((statement) => statement.ok && changesSchema(statement.statement))) {
          const rows = await api.connections.list()
          setConnections(rows)
          await refreshSchema(rows, activeConnection.id)
        }
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : '执行失败'
      if (/查询已取消|查询已超时/.test(message)) pushToast('info', message)
      else pushToast('error', message)
    } finally {
      if (sqlRequestRef.current === requestId) sqlRequestRef.current = null
      setRunning(false)
    }
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
    if (activeConnectionId === id) {
      setTxnOpen(false)
      setTxnSupported(false)
    } else {
      await refreshTxnStatus(activeConnectionId)
    }
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
  const tableCrumb =
    selected?.kind === 'table' && selected.connectionId === activeConnection?.id ? selected.displayName : null
  const breadcrumb = [activeConnection?.name, tableCrumb].filter(Boolean).join('  /  ')

  useEffect(() => {
    void refreshTxnStatus(activeConnectionId)
  }, [activeConnectionId, connections])


  useEffect(() => {
    if (!ready || !activeConnectionId) return
    if (healthById[activeConnectionId]) return
    void checkConnectionHealth(activeConnectionId, true)
  }, [ready, activeConnectionId])

  const value: WorkspaceValue = {
    ready,
    meta,
    connections,
    connectionGroups,
    refreshConnectionGroups,
    saveConnectionGroup,
    removeConnectionGroup,
    healthById,
    checkConnectionHealth,
    checkAllConnectionHealth,
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
    setActiveEditor: (id: string) => {
      setActiveEditorId(id)
      const tab = editorTabs.find((row) => row.id === id)
      if (tab?.connectionId && connections.some((row) => row.id === tab.connectionId)) {
        setActiveConnectionId(tab.connectionId)
      }
    },
    tabDisconnected: (tab) => isTabDisconnected(tab, connections.map((row) => row.id)),
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
    lastRun,
    slowQueryMs,
    setSlowQueryMs,
    txnOpen,
    txnSupported,
    readOnlyActive,
    globalReadOnly,
    setGlobalReadOnly,
    toggleConnectionReadOnly,
    assertWritable,
    beginTxn,
    commitTxn,
    rollbackTxn,
    run,
    cancelRun,
    explain,
    clearAiMemory,
    exportConnections,
    importConnections,
    applyImportPlan,
    loadHistory,
    clearHistory,
    removeHistory,
    openHistorySql,
    rerunHistory,
    listFavorites,
    saveFavorite,
    removeFavorite,
    insertFavoriteSql,
    recentTables,
    recentQueries,
    refreshRecent,
    clearRecent,
    openRecentTable,
    openRecentQuery,
    searchStats,
    cursor,
    setCursor,
    aiTurns,
    aiStreaming,
    aiIntent,
    setAiIntent,
    referenceTable,
    setReferenceTable,
    targetTable,
    setTargetTable,
    tableNames,
    sendAi,
    executeAiSql,
    repairAi,
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
    askDelete: (connection) => {
      void (async () => {
        let inTxn = false
        try {
          if (supportsManualTransaction(connection.dialect)) {
            const status = await api.sql.txnStatus(connection.id)
            inTxn = status.open
          }
        } catch {
          inTxn = false
        }
        setDialog({ type: 'delete', connection, inTxn })
      })()
    },
    closeDialog: () => setDialog(null),
    saveConnection,
    testConnection: (input) => api.connections.test(input),
    deleteConnection,
    restoreSample,
    pickFile: (mode) => api.connections.pickFile(mode),
    structureTarget,
    openTableStructure,
    closeTableStructure,
    openTableQuery,
    loadTableStructure,
    columnStatsTarget,
    openColumnStats,
    closeColumnStats,
    runSqlText,
    openSqlTab,
    importTarget,
    openImportWizard,
    closeImportWizard,
    schemaDiffOpen,
    schemaDiffSeed,
    openSchemaDiff,
    closeSchemaDiff,
    refreshConnections,
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

