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
import { emitDataai } from '../appEvents'
import { connectionErrorNode } from '@shared/schema'
import { changesSchema, quoteIdentIfNeeded, statementTitle } from '@shared/sql'
import {
  DEFAULT_PAGE_SIZE,
  buildBrowseSql,
  buildCountSql,
  clampBrowsePage,
  normalizePageSize,
  parseCountValue,
  type PageSize,
  type TableBrowseState,
} from '@shared/tablePaging'
import { INITIAL_TABS } from '@shared/session'
import { isTabDirty, withCleanBaseline } from '@shared/tabDirty'
import {
  closeOthersTargets,
  closeToRightTargets,
  moveTabToIndex,
  sortPinnedFirst,
  togglePinnedFlag,
} from '@shared/tabPin'
import { duplicateTabTitle, sanitizeTabTitle } from '@shared/tabTitle'
import {
  popClosedTab,
  pushClosedTab,
  snapshotClosedTab,
  type ClosedTabSnapshot,
} from '@shared/closedTabStack'
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
import { DEFAULT_SLOW_QUERY_MS, isSlowQuery } from '@shared/slowQuery'
import {
  DEFAULT_EDITOR_FONT_SIZE,
  clampEditorFontSize,
} from '@shared/prefs'
import {
  createNotification,
  markAllNotificationsRead,
  prependNotification,
  shouldRecordNotification,
  unreadNotificationCount,
  type AppNotification,
  type NotifKind,
  type NotifTone,
} from '@shared/notifications'
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

type UnsavedDecision = 'discard' | 'keep'

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
  | {
      type: 'unsaved'
      scope: 'tab' | 'window'
      title: string
      detail: string
      onDecide: (decision: UnsavedDecision) => void
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
  isEditorDirty: (id: string) => boolean
  requestCloseWindow: () => void
  togglePinTab: (id: string) => void
  closeOtherTabs: (id: string) => void
  closeTabsToRight: (id: string) => void
  renameTab: (id: string, title: string) => void
  duplicateTab: (id: string) => void
  reopenClosedTab: () => void
  canReopenClosedTab: boolean
  reorderEditorTabs: (fromId: string, insertBeforeIndex: number) => void
  results: ResultState | null
  setActiveResult: (id: string) => void
  running: boolean
  lastRun: LastRunStats | null
  slowQueryMs: number
  setSlowQueryMs: (ms: number) => Promise<void>
  editorMinimap: boolean
  editorFontSize: number
  editorWordWrap: boolean
  setEditorMinimap: (value: boolean) => Promise<void>
  setEditorFontSize: (value: number) => Promise<void>
  setEditorWordWrap: (value: boolean) => Promise<void>
  toggleEditorMinimap: () => Promise<void>
  toggleEditorWordWrap: () => Promise<void>
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
  /** Insert dialect-quoted table/column ident at Monaco cursor. */
  insertObjectIdent: (name: string, dialect?: string | null) => void
  settings: AiSettingsPublic | null
  saveSettings: (input: { baseUrl: string; model: string; apiKey?: string }) => Promise<void>
  toasts: Toast[]
  dismissToast: (id: string) => void
  notifications: AppNotification[]
  unreadNotificationCount: number
  clearNotifications: () => void
  markNotificationsRead: () => void
  dismissNotification: (id: string) => void
  notifyOnErrorOnly: boolean
  notifyOnSlowQuery: boolean
  setNotifyOnErrorOnly: (value: boolean) => Promise<void>
  setNotifyOnSlowQuery: (value: boolean) => Promise<void>
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
  setBrowsePage: (page: number) => void
  setBrowsePageSize: (pageSize: PageSize) => void
  refreshBrowse: () => void
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
  return INITIAL_TABS.map((tab, index) =>
    withCleanBaseline({
      id: `query-${index + 1}`,
      title: tab.title,
      sql: tab.sql,
      connectionId: null,
    }),
  )
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
  const closedStackRef = useRef<ClosedTabSnapshot[]>([])
  const [closedStackLen, setClosedStackLen] = useState(0)
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
  const [notifications, setNotifications] = useState<AppNotification[]>([])
  const [notifyOnErrorOnly, setNotifyOnErrorOnlyState] = useState(false)
  const [notifyOnSlowQuery, setNotifyOnSlowQueryState] = useState(false)
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
  const [editorMinimap, setEditorMinimapState] = useState(false)
  const [editorFontSize, setEditorFontSizeState] = useState(DEFAULT_EDITOR_FONT_SIZE)
  const [editorWordWrap, setEditorWordWrapState] = useState(false)
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

  const pushNotification = useCallback(
    (input: {
      kind: NotifKind
      tone: NotifTone
      title: string
      detail?: string
    }) => {
      if (
        !shouldRecordNotification(input.kind, input.tone, {
          notifyOnErrorOnly,
          notifyOnSlowQuery,
        })
      ) {
        return
      }
      const item = createNotification(input)
      setNotifications((current) => prependNotification(current, item))
    },
    [notifyOnErrorOnly, notifyOnSlowQuery],
  )

  const clearNotifications = useCallback(() => setNotifications([]), [])
  const markNotificationsRead = useCallback(() => {
    setNotifications((current) => markAllNotificationsRead(current))
  }, [])
  const dismissNotification = useCallback((id: string) => {
    setNotifications((current) => current.filter((row) => row.id !== id))
  }, [])

  const setNotifyOnErrorOnly = useCallback(
    async (value: boolean) => {
      const next = await api.prefs.save({ notifyOnErrorOnly: value })
      setNotifyOnErrorOnlyState(next.notifyOnErrorOnly === true)
      pushToast('success', next.notifyOnErrorOnly ? '通知中心仅记录错误' : '通知中心记录成功与错误')
    },
    [api, pushToast],
  )

  const setNotifyOnSlowQuery = useCallback(
    async (value: boolean) => {
      const next = await api.prefs.save({ notifyOnSlowQuery: value })
      setNotifyOnSlowQueryState(next.notifyOnSlowQuery === true)
      pushToast('success', next.notifyOnSlowQuery ? '已开启慢查询通知' : '已关闭慢查询通知')
    },
    [api, pushToast],
  )

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
        setEditorMinimapState(prefs.editorMinimap === true)
        setEditorFontSizeState(clampEditorFontSize(prefs.editorFontSize))
        setEditorWordWrapState(prefs.editorWordWrap === true)
        setNotifyOnErrorOnlyState(prefs.notifyOnErrorOnly === true)
        setNotifyOnSlowQueryState(prefs.notifyOnSlowQuery === true)
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
            const tabs = normalizeSessionTabs(workspace.editorTabs, SESSION_TAB_CAP).map(withCleanBaseline)
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

  const applyBrowseToTab = (
    tabId: string,
    browse: TableBrowseState,
    dialect: ConnectionPublic['dialect'],
  ) => {
    const nextBrowse = clampBrowsePage(browse)
    const sql = buildBrowseSql(dialect, nextBrowse.tableName, nextBrowse.page, nextBrowse.pageSize)
    setEditorTabs((tabs) =>
      tabs.map((tab) =>
        tab.id === tabId
          ? withCleanBaseline({
              ...tab,
              sql,
              connectionId: nextBrowse.connectionId,
              browse: nextBrowse,
            })
          : tab,
      ),
    )
    return { sql, browse: nextBrowse }
  }

  const openTableQuery = (connectionId: string, tableName: string) => {
    setActiveConnectionId(connectionId)
    const connection = connections.find((item) => item.id === connectionId)
    const dialect = connection?.dialect ?? 'sqlite'
    if (dialect === 'redis') return
    void recordTableRecent(connectionId, tableName)
    const title = tableName
    const existing = editorTabs.find((tab) => tab.title === title)
    const pageSize = existing?.browse?.pageSize ?? DEFAULT_PAGE_SIZE
    const browse: TableBrowseState = {
      connectionId,
      tableName,
      page: 0,
      pageSize,
      totalRows: null,
    }
    if (existing) {
      setActiveEditorId(existing.id)
      setTargetTable(tableName)
      applyBrowseToTab(existing.id, browse, dialect)
      void loadBrowsePage(existing.id, browse, dialect, { refreshCount: true, quiet: true })
      return
    }
    const id = crypto.randomUUID()
    const sql = buildBrowseSql(dialect, tableName, 0, pageSize)
    setEditorTabs((tabs) => [
      ...tabs,
      withCleanBaseline({ id, title, sql, connectionId, browse }),
    ])
    setActiveEditorId(id)
    setTargetTable(tableName)
    void loadBrowsePage(id, browse, dialect, { refreshCount: true, quiet: true })
  }

  const setBrowsePage = (page: number) => {
    const tab = activeEditor
    if (!tab?.browse) return
    const connection = connections.find((item) => item.id === tab.browse!.connectionId)
    const dialect = connection?.dialect ?? 'sqlite'
    if (dialect === 'redis') return
    const browse = clampBrowsePage({ ...tab.browse, page: Math.max(0, Math.floor(page)) })
    if (browse.page === tab.browse.page) return
    applyBrowseToTab(tab.id, browse, dialect)
    void loadBrowsePage(tab.id, browse, dialect, { refreshCount: false, quiet: true })
  }

  const setBrowsePageSize = (pageSize: PageSize) => {
    const tab = activeEditor
    if (!tab?.browse) return
    const connection = connections.find((item) => item.id === tab.browse!.connectionId)
    const dialect = connection?.dialect ?? 'sqlite'
    if (dialect === 'redis') return
    const size = normalizePageSize(pageSize)
    const browse: TableBrowseState = {
      ...tab.browse,
      pageSize: size,
      page: 0,
      totalRows: tab.browse.totalRows ?? null,
    }
    applyBrowseToTab(tab.id, browse, dialect)
    void loadBrowsePage(tab.id, browse, dialect, { refreshCount: true, quiet: true })
  }

  const refreshBrowse = () => {
    const tab = activeEditor
    if (!tab?.browse) return
    const connection = connections.find((item) => item.id === tab.browse!.connectionId)
    const dialect = connection?.dialect ?? 'sqlite'
    if (dialect === 'redis') return
    void loadBrowsePage(tab.id, tab.browse, dialect, { refreshCount: true, quiet: true })
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
    pushNotification({
      kind: 'import',
      tone: 'success',
      title: '导入完成',
      detail: '对象树已刷新',
    })
  }


  const openSqlTab = (title: string, sql: string) => {
    const id = crypto.randomUUID()
    setEditorTabs((tabs) => [
      ...tabs,
      withCleanBaseline({ id, title, sql, connectionId: activeConnectionId }),
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
      if (!health.ok && !health.unsupported) {
        pushNotification({
          kind: 'health',
          tone: 'error',
          title: '连接探测失败',
          detail: `${connection.name}: ${health.error ?? '探测失败'}`,
        })
      }
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
      pushNotification({
        kind: 'health',
        tone: 'error',
        title: '连接探测失败',
        detail: `${connection.name}: ${health.error ?? '探测失败'}`,
      })
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
    if (node.connectionId) openTableQuery(node.connectionId, node.tableName)
  }

  const updateSql = (sql: string) => {
    if (!activeEditor) return
    setEditorTabs((tabs) =>
      tabs.map((tab) => {
        if (tab.id !== activeEditor.id) return tab
        if (!tab.browse) return { ...tab, sql }
        const connection = connections.find((item) => item.id === tab.browse!.connectionId)
        const dialect = connection?.dialect ?? 'sqlite'
        const expected = buildBrowseSql(
          dialect,
          tab.browse.tableName,
          tab.browse.page,
          tab.browse.pageSize,
        )
        if (sql === tab.sql || sql.trim() === expected.trim()) {
          return { ...tab, sql }
        }
        const { browse: _drop, ...rest } = tab
        return { ...rest, sql }
      }),
    )
  }

  const newTab = () => {
    const id = crypto.randomUUID()
    const count = editorTabs.length + 1
    setEditorTabs((tabs) => [
      ...tabs,
      withCleanBaseline({ id, title: `查询 ${count}`, sql: '', connectionId: activeConnectionId }),
    ])
    setActiveEditorId(id)
  }

  const rememberClosedTab = (tab: EditorTabState) => {
    closedStackRef.current = pushClosedTab(closedStackRef.current, snapshotClosedTab(tab))
    setClosedStackLen(closedStackRef.current.length)
  }

  const closeTabNow = (id: string) => {
    const closing = editorTabs.find((tab) => tab.id === id)
    if (closing) rememberClosedTab(closing)
    const remaining = editorTabs.filter((tab) => tab.id !== id)
    if (remaining.length === 0) {
      setEditorTabs([
        withCleanBaseline({ id: editorTabs[0]?.id ?? id, title: '查询 1', sql: '' }),
      ])
      setResultMap((current) => {
        const next = { ...current }
        delete next[id]
        return next
      })
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

  const closeTab = (id: string) => {
    const tab = editorTabs.find((row) => row.id === id)
    if (!tab) return
    if (!isTabDirty(tab)) {
      closeTabNow(id)
      return
    }
    setDialog({
      type: 'unsaved',
      scope: 'tab',
      title: '关闭未保存的标签？',
      detail: `「${tab.title}」的 SQL 已修改，关闭后将丢弃这些更改。`,
      onDecide: (decision) => {
        setDialog(null)
        if (decision === 'discard') closeTabNow(id)
      },
    })
  }

  const isEditorDirty = (id: string) => {
    const tab = editorTabs.find((row) => row.id === id)
    return tab ? isTabDirty(tab) : false
  }

  const requestCloseWindow = () => {
    const dirty = editorTabs.filter(isTabDirty)
    if (dirty.length === 0) {
      void api.window.close().catch(() => undefined)
      return
    }
    const names = dirty
      .slice(0, 4)
      .map((tab) => tab.title)
      .join('、')
    const more = dirty.length > 4 ? ` 等 ${dirty.length} 个` : ''
    setDialog({
      type: 'unsaved',
      scope: 'window',
      title: '有未保存的查询标签',
      detail: `以下标签的 SQL 已修改：${names}${more}。关闭前请确认是否丢弃这些编辑。`,
      onDecide: (decision) => {
        setDialog(null)
        if (decision === 'discard') void api.window.close().catch(() => undefined)
      },
    })
  }


  const togglePinTab = (id: string) => {
    setEditorTabs((tabs) =>
      sortPinnedFirst(tabs.map((tab) => (tab.id === id ? togglePinnedFlag(tab) : tab))),
    )
  }

  const closeTabsBatch = (targets: EditorTabState[], dialogTitle: string) => {
    if (targets.length === 0) return
    const dirty = targets.filter(isTabDirty)
    const apply = () => {
      for (const tab of targets) rememberClosedTab(tab)
      const ids = new Set(targets.map((tab) => tab.id))
      const remaining = editorTabs.filter((tab) => !ids.has(tab.id))
      setResultMap((current) => {
        const next = { ...current }
        for (const id of ids) delete next[id]
        return next
      })
      if (remaining.length === 0) {
        const fallbackId = editorTabs[0]?.id ?? crypto.randomUUID()
        setEditorTabs([withCleanBaseline({ id: fallbackId, title: '查询 1', sql: '' })])
        setActiveEditorId(fallbackId)
        return
      }
      setEditorTabs(remaining)
      if (ids.has(activeEditorId)) {
        setActiveEditorId(remaining[0].id)
      }
    }
    if (dirty.length === 0) {
      apply()
      return
    }
    const names = dirty
      .slice(0, 3)
      .map((tab) => tab.title)
      .join('、')
    const more = dirty.length > 3 ? ` 等 ${dirty.length} 个` : ''
    setDialog({
      type: 'unsaved',
      scope: 'tab',
      title: dialogTitle,
      detail: `将关闭 ${targets.length} 个未固定标签，其中未保存：${names}${more}。固定标签会保留。`,
      onDecide: (decision) => {
        setDialog(null)
        if (decision === 'discard') apply()
      },
    })
  }

  const closeOtherTabs = (id: string) => {
    closeTabsBatch(closeOthersTargets(editorTabs, id), '关闭其他标签？')
  }

  const closeTabsToRight = (id: string) => {
    closeTabsBatch(closeToRightTargets(editorTabs, id), '关闭右侧标签？')
  }

  const renameTab = (id: string, title: string) => {
    setEditorTabs((tabs) =>
      tabs.map((tab) => {
        if (tab.id !== id) return tab
        return { ...tab, title: sanitizeTabTitle(title, tab.title) }
      }),
    )
  }

  const duplicateTab = (id: string) => {
    const source = editorTabs.find((tab) => tab.id === id)
    if (!source) return
    const newId = crypto.randomUUID()
    const copy = withCleanBaseline({
      id: newId,
      title: duplicateTabTitle(source.title),
      sql: source.sql,
      connectionId: source.connectionId ?? activeConnectionId,
      ...(source.browse ? { browse: { ...source.browse } } : {}),
    })
    setEditorTabs((tabs) => {
      const index = tabs.findIndex((tab) => tab.id === id)
      const next = tabs.slice()
      next.splice(index < 0 ? next.length : index + 1, 0, copy)
      return sortPinnedFirst(next)
    })
    setActiveEditorId(newId)
  }


  const reorderEditorTabs = (fromId: string, insertBeforeIndex: number) => {
    setEditorTabs((tabs) => moveTabToIndex(tabs, fromId, insertBeforeIndex))
  }

  const reopenClosedTab = () => {
    const { stack, item } = popClosedTab(closedStackRef.current)
    if (!item) {
      pushToast('info', '没有可重新打开的标签')
      return
    }
    closedStackRef.current = stack
    setClosedStackLen(stack.length)
    const connOk =
      Boolean(item.connectionId) && connections.some((row) => row.id === item.connectionId)
    const newId = crypto.randomUUID()
    const restored = withCleanBaseline({
      id: newId,
      title: sanitizeTabTitle(item.title),
      sql: item.sql,
      connectionId: connOk ? item.connectionId : null,
      ...(item.pinned ? { pinned: true } : {}),
      ...(item.browse && connOk ? { browse: { ...item.browse } } : {}),
    })
    setEditorTabs((tabs) => sortPinnedFirst([...tabs, restored]))
    setActiveEditorId(newId)
    if (item.connectionId && !connOk) {
      pushToast('info', '原连接已不存在，已以断开状态打开')
    }
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

  const setEditorMinimap = useCallback(
    async (value: boolean) => {
      const next = await api.prefs.save({ editorMinimap: value })
      setEditorMinimapState(next.editorMinimap === true)
      pushToast('success', next.editorMinimap ? '已开启编辑器小地图' : '已关闭编辑器小地图')
    },
    [api, pushToast],
  )

  const toggleEditorMinimap = useCallback(async () => {
    await setEditorMinimap(!editorMinimap)
  }, [editorMinimap, setEditorMinimap])

  const setEditorWordWrap = useCallback(
    async (value: boolean) => {
      const next = await api.prefs.save({ editorWordWrap: value })
      setEditorWordWrapState(next.editorWordWrap === true)
      pushToast('success', next.editorWordWrap ? '已开启自动换行' : '已关闭自动换行')
    },
    [api, pushToast],
  )

  const toggleEditorWordWrap = useCallback(async () => {
    await setEditorWordWrap(!editorWordWrap)
  }, [editorWordWrap, setEditorWordWrap])

  const setEditorFontSize = useCallback(
    async (value: number) => {
      const next = await api.prefs.save({ editorFontSize: clampEditorFontSize(value) })
      setEditorFontSizeState(next.editorFontSize)
      pushToast('success', `编辑器字号 ${next.editorFontSize}`)
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

  const runSqlText = async (
    sql: string,
    opts?: { connectionId?: string; editorId?: string; quiet?: boolean },
  ) => {
    if (running) return
    const connectionId = opts?.connectionId ?? activeConnection?.id
    const connection = connections.find((item) => item.id === connectionId) ?? activeConnection
    const editorId = opts?.editorId ?? activeEditor?.id
    const quiet = opts?.quiet === true
    if (!connection) {
      pushToast('info', '先在左侧选择一个连接')
      return
    }
    if (isKvDialect(connection.dialect)) {
      pushToast('info', 'Redis 请使用键浏览器，而不是 SQL 运行')
      return
    }
    const readOnlyHit = analyzeReadOnlySql(sql)
    const readOnlyForConn = isReadOnlyEffective(globalReadOnly, connection.readOnly)
    if (readOnlyForConn && readOnlyHit.blocked) {
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
        connectionId: connection.id,
        sql,
        requestId,
        timeoutMs,
      })
      const next = resultsFrom(statements)
      const elapsedMs = statements.reduce((sum, item) => sum + (item.elapsedMs || 0), 0)
      const rowCount = statements.reduce((sum, item) => sum + (item.rows?.length ?? 0), 0)
      setLastRun({ rows: rowCount, elapsedMs, ok: statements.every((item) => item.ok), kind: 'run' })
      if (editorId) setResultMap((current) => ({ ...current, [editorId]: next }))
      const failed = statements.find((statement) => !statement.ok)
      if (failed) {
        pushToast('error', failed.error ?? '执行失败')
        pushNotification({
          kind: 'query',
          tone: 'error',
          title: '查询失败',
          detail: failed.error ?? '执行失败',
        })
      } else {
        if (!quiet) {
          pushToast('success', '执行完成')
          pushNotification({
            kind: 'query',
            tone: 'success',
            title: '查询完成',
            detail: `${rowCount} 行 · ${elapsedMs} ms · ${connection.name}`,
          })
        }
        if (!quiet && isSlowQuery(elapsedMs, slowQueryMs)) {
          pushNotification({
            kind: 'slow',
            tone: 'warn',
            title: '慢查询',
            detail: `${elapsedMs} ms（阈值 ${slowQueryMs} ms）· ${connection.name}`,
          })
        }
        void recordQueryRecent(sql, connection.id)
        if (editorId) {
          setEditorTabs((tabs) =>
            tabs.map((tab) => (tab.id === editorId ? { ...tab, connectionId: connection.id } : tab)),
          )
        }
      }
      if (statements.some((statement) => statement.ok && changesSchema(statement.statement))) {
        const rows = await api.connections.list()
        setConnections(rows)
        await refreshSchema(rows, connection.id)
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : '执行失败'
      if (/查询已取消|查询已超时/.test(message)) {
        setLastRun({ rows: 0, elapsedMs: 0, ok: false, kind: 'run' })
        pushToast('info', message)
        pushNotification({
          kind: 'query',
          tone: 'warn',
          title: '查询中断',
          detail: message,
        })
      } else {
        pushToast('error', message)
        pushNotification({
          kind: 'query',
          tone: 'error',
          title: '查询失败',
          detail: message,
        })
      }
    } finally {
      if (sqlRequestRef.current === requestId) sqlRequestRef.current = null
      setRunning(false)
    }
  }


  const loadBrowsePage = async (
    tabId: string,
    browse: TableBrowseState,
    dialect: ConnectionPublic['dialect'],
    opts?: { refreshCount?: boolean; quiet?: boolean },
  ) => {
    const refreshCount = opts?.refreshCount !== false
    let next = clampBrowsePage(browse)
    if (refreshCount || next.totalRows == null) {
      try {
        const countSql = buildCountSql(dialect, next.tableName)
        const prefs = await api.prefs.get()
        const timeoutMs = prefs.queryTimeoutSec > 0 ? prefs.queryTimeoutSec * 1000 : 0
        const statements = await api.sql.execute({
          connectionId: next.connectionId,
          sql: countSql,
          requestId: crypto.randomUUID(),
          timeoutMs,
        })
        const row = statements[0]?.rows?.[0] as Record<string, unknown> | undefined
        const total = parseCountValue(row)
        next = clampBrowsePage({ ...next, totalRows: total })
      } catch {
        next = { ...next, totalRows: next.totalRows ?? null }
      }
    }
    const { sql } = applyBrowseToTab(tabId, next, dialect)
    await runSqlText(sql, {
      connectionId: next.connectionId,
      editorId: tabId,
      quiet: opts?.quiet !== false,
    })
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
        pushNotification({
          kind: 'query',
          tone: 'error',
          title: '查询失败',
          detail: failed.error ?? '执行失败',
        })
        void repairAi(failed.statement || sql, failed.error ?? '执行失败')
      } else {
        pushToast('success', '执行完成')
        pushNotification({
          kind: 'query',
          tone: 'success',
          title: '查询完成',
          detail: `${rowCount} 行 · ${elapsedMs} ms · ${activeConnection.name}`,
        })
        if (isSlowQuery(elapsedMs, slowQueryMs)) {
          pushNotification({
            kind: 'slow',
            tone: 'warn',
            title: '慢查询',
            detail: `${elapsedMs} ms（阈值 ${slowQueryMs} ms）· ${activeConnection.name}`,
          })
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
        pushNotification({
          kind: 'query',
          tone: 'warn',
          title: '查询中断',
          detail: message,
        })
      } else {
        pushToast('error', message)
        pushNotification({
          kind: 'query',
          tone: 'error',
          title: '查询失败',
          detail: message,
        })
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

  const insertObjectIdent = (name: string, dialect?: string | null) => {
    const raw = name.trim()
    if (!raw) return
    const dial = dialect || activeConnection?.dialect || 'sqlite'
    const text = quoteIdentIfNeeded(raw, dial)
    emitDataai('dataai:insert-at-cursor', { text })
    pushToast('success', `已插入 ${text}`)
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
        withCleanBaseline({ id, title: `查询 ${tabs.length + 1}`, sql, connectionId: activeConnectionId }),
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
      withCleanBaseline({ id, title: `历史 ${tabs.length + 1}`, sql, connectionId: activeConnectionId }),
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
      withCleanBaseline({ id, title: `历史 ${tabs.length + 1}`, sql, connectionId: activeConnectionId }),
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
    isEditorDirty,
    requestCloseWindow,
    togglePinTab,
    closeOtherTabs,
    closeTabsToRight,
    renameTab,
    duplicateTab,
    reopenClosedTab,
    canReopenClosedTab: closedStackLen > 0,
    reorderEditorTabs,
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
    editorMinimap,
    editorFontSize,
    editorWordWrap,
    setEditorMinimap,
    setEditorFontSize,
    setEditorWordWrap,
    toggleEditorMinimap,
    toggleEditorWordWrap,
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
    insertObjectIdent,
    settings: settings ?? defaultSettings,
    saveSettings: async (input) => {
      const next = await api.ai.saveSettings(input)
      setSettings(next)
      pushToast('success', '模型配置已保存')
    },
    toasts,
    dismissToast: (id) => setToasts((current) => current.filter((toast) => toast.id !== id)),
    notifications,
    unreadNotificationCount: unreadNotificationCount(notifications),
    clearNotifications,
    markNotificationsRead,
    dismissNotification,
    notifyOnErrorOnly,
    notifyOnSlowQuery,
    setNotifyOnErrorOnly,
    setNotifyOnSlowQuery,
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
    setBrowsePage,
    setBrowsePageSize,
    refreshBrowse,
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

