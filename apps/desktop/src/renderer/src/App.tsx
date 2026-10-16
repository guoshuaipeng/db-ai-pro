import { useCallback, useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react'
import { emitDataai, onDataai } from './appEvents'
import type { CommandDef } from '@shared/commands'
import { templateIdFromCommand } from '@shared/queryTemplates'
import { isKvDialect } from '@shared/types'
import { Mark } from './components/icons'
import { TitleBar } from './components/TitleBar'
import { resolveTabConnectionColor } from '@shared/tabConnectionColor'
import { WelcomePanel } from './components/WelcomePanel'
import { NotificationDrawer } from './components/NotificationDrawer'
import { ConnectionPane } from './components/ConnectionPane'
import { EditorPane, ResultPane } from './components/EditorPane'
import { AiPane } from './components/AiPane'
import { RedisPane } from './components/RedisPane'
import { Dialogs } from './components/Dialogs'
import { TableStructurePanel } from './components/TableStructurePanel'
import { ColumnStatsPanel } from './components/ColumnStatsPanel'
import { ImportWizard } from './components/ImportWizard'
import { SchemaDiffPanel } from './components/SchemaDiffPanel'
import { CommandPalette } from './components/CommandPalette'
import type { SqlFavorite } from '@shared/types'
import { ShortcutsHelp } from './components/ShortcutsHelp'
import { GotoLineDialog } from './components/GotoLineDialog'
import { StatusBar } from './components/StatusBar'
import { SettingsCenter, type SettingsTab } from './components/SettingsCenter'
import {
  DEFAULT_PREFS,
  formatZoomPercent,
  stepZoomFactor,
  type AppPrefs,
} from '@shared/prefs'
import { LAYOUT } from '@shared/layoutBounds'
import {
  layoutResetDefaults,
  layoutResetToast,
  layoutSplitterAriaLabel,
} from '@shared/layoutReset'
import { formatElapsedMs, isSlowQuery } from '@shared/slowQuery'
import { statusBarRerunAction } from '@shared/statusBarRerun'
import {
  countSqlStatements,
  sqlStatementCountLabel,
  sqlStatementCountTitle,
} from '@shared/sqlStatementCount'
import { editorSelectionStatusLabel } from '@shared/editorSelection'
import { shouldCancelRunOnEscape } from '@shared/escCancelRun'
import { isUiModalOpen } from './uiModal'
import { getApi } from './bridge'
import { useWorkspace } from './state/workspace'

export function App() {
  const ws = useWorkspace()
  const [paletteOpen, setPaletteOpen] = useState(false)
  const [notifOpen, setNotifOpen] = useState(false)
  const [paletteFavorites, setPaletteFavorites] = useState<SqlFavorite[]>([])

  useEffect(() => {
    if (!paletteOpen) return
    let cancelled = false
    void ws.listFavorites().then((rows) => {
      if (!cancelled) setPaletteFavorites(rows)
    }).catch(() => {
      if (!cancelled) setPaletteFavorites([])
    })
    return () => {
      cancelled = true
    }
  }, [paletteOpen, ws])
  const [shortcutsOpen, setShortcutsOpen] = useState(false)
  const [gotoOpen, setGotoOpen] = useState(false)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [settingsTab, setSettingsTab] = useState<SettingsTab>('model')
  const [prefs, setPrefs] = useState<AppPrefs>(DEFAULT_PREFS)

  const openSettings = (tab: SettingsTab = 'model') => {
    setSettingsTab(tab)
    setSettingsOpen(true)
  }

  useEffect(() => onDataai('dataai:open-ai-settings', () => openSettings('model')), [])
  useEffect(() => onDataai('dataai:open-goto-line', () => setGotoOpen(true)), [])

  useEffect(() => {
    let cancelled = false
    void getApi()
      .prefs.get()
      .then((value) => {
        if (!cancelled) setPrefs(value)
      })
      .catch(() => undefined)
    return () => {
      cancelled = true
    }
  }, [])

  const applyZoom = useCallback(async (factor: number) => {
    try {
      const result = await getApi().window.setZoomFactor(factor)
      setPrefs((current) => ({ ...current, zoomFactor: result.zoomFactor }))
    } catch {
      const next = await getApi().prefs.save({ zoomFactor: factor })
      setPrefs(next)
    }
  }, [])

  const toggleAlwaysOnTop = useCallback(async () => {
    const nextValue = !prefs.alwaysOnTop
    try {
      const result = await getApi().window.setAlwaysOnTop(nextValue)
      setPrefs((current) => ({ ...current, alwaysOnTop: result.alwaysOnTop }))
    } catch {
      const next = await getApi().prefs.save({ alwaysOnTop: nextValue })
      setPrefs(next)
    }
  }, [prefs.alwaysOnTop])

  const zoomIn = useCallback(() => {
    void applyZoom(stepZoomFactor(prefs.zoomFactor, 1))
  }, [applyZoom, prefs.zoomFactor])

  const zoomOut = useCallback(() => {
    void applyZoom(stepZoomFactor(prefs.zoomFactor, -1))
  }, [applyZoom, prefs.zoomFactor])

  const zoomReset = useCallback(() => {
    void applyZoom(1)
  }, [applyZoom])

  const dismissWelcome = useCallback(async () => {
    const next = await getApi().prefs.save({ welcomeDismissed: true })
    setPrefs(next)
  }, [])

  const runCommand = useCallback(
    (command: CommandDef) => {
      switch (command.id) {
        case 'query.new':
          ws.newTab()
          break
        case 'query.duplicate':
          if (ws.activeEditor) ws.duplicateTab(ws.activeEditor.id)
          break
        case 'query.reopenClosed':
          ws.reopenClosedTab()
          break
        case 'query.run':
          emitDataai('dataai:request-run')
          break
        case 'query.cancel':
          if (ws.running) ws.cancelRun()
          break
        case 'query.fillParams':
          emitDataai('dataai:fill-query-params')
          break
        case 'query.explain':
          void ws.explain()
          break
        case 'query.saveFavorite':
          emitDataai('dataai:save-favorite')
          break
        case 'query.favorites':
          emitDataai('dataai:open-favorites')
          break
        case 'query.history':
          emitDataai('dataai:open-history')
          break
        case 'query.slowHistory':
          emitDataai('dataai:open-history-slow')
          break
        case 'query.beginTxn':
          void ws.beginTxn()
          break
        case 'query.commitTxn':
          void ws.commitTxn()
          break
        case 'query.rollbackTxn':
          void ws.rollbackTxn()
          break
        case 'query.saveToFile':
          void ws.saveEditorSqlToFile()
          break
        case 'query.openFromFile':
          void ws.openSqlFile()
          break
        case 'query.format':
          emitDataai('dataai:format-sql')
          break
        case 'query.templates':
          emitDataai('dataai:open-templates')
          break
        case 'editor.toggleComment':
          emitDataai('dataai:toggle-comment')
          break
        case 'editor.find':
          emitDataai('dataai:find')
          break
        case 'editor.gotoLine':
          setGotoOpen(true)
          break
        case 'result.find':
          emitDataai('dataai:result-find')
          break
        case 'result.autofitColumns':
          emitDataai('dataai:result-autofit-columns')
          break
        case 'result.copyHeaders':
          emitDataai('dataai:result-copy-headers')
          break
        case 'result.copyMessage':
          emitDataai('dataai:result-copy-message')
          break
        case 'result.copyMarkdown':
          emitDataai('dataai:result-copy-markdown')
          break
        case 'result.copyJson':
          emitDataai('dataai:result-copy-json')
          break
        case 'editor.replace':
          emitDataai('dataai:replace')
          break
        case 'schema.diff':
          ws.openSchemaDiff()
          break
        case 'view.focusSearch':
          if (!ws.sidebarOpen) ws.toggleSidebar()
          window.setTimeout(() => emitDataai('dataai:focus-tree-search'), 40)
          break
        case 'view.focusEditor':
          emitDataai('dataai:focus-editor')
          break
        case 'view.focusResult':
          emitDataai('dataai:focus-result')
          break
        case 'view.toggleSidebar':
          ws.toggleSidebar()
          break
        case 'view.toggleAi':
          ws.toggleAi()
          break
        case 'connection.health':
          if (ws.activeConnection) void ws.checkConnectionHealth(ws.activeConnection.id, false)
          break
        case 'connection.healthAll':
          void ws.checkAllConnectionHealth()
          break
        case 'safe.globalReadOnly':
          void ws.setGlobalReadOnly(!ws.globalReadOnly)
          break
        case 'safe.connectionReadOnly':
          void ws.toggleConnectionReadOnly()
          break
        case 'connection.new':
          ws.openCreate()
          break
        case 'connection.duplicate':
          if (ws.activeConnection) void ws.duplicateConnection(ws.activeConnection.id)
          else ws.pushToast('info', '先选择一个连接')
          break
        case 'connection.copyEndpoint':
          if (ws.activeConnection) void ws.copyConnectionEndpoint(ws.activeConnection.id)
          else ws.pushToast('info', '先选择一个连接')
          break
        case 'view.collapseObjectTree':
          ws.collapseObjectTree()
          break
        case 'connection.revealInTree':
          ws.revealConnectionInTree()
          break
        case 'connection.export':
          void ws.exportConnections()
          break
        case 'connection.import':
          void ws.importConnections()
          break
        case 'ai.settings':
          openSettings('model')
          break
        case 'help.about':
          openSettings('about')
          break
        case 'ai.clear':
          ws.clearAiMemory()
          break
        case 'view.toggleMinimap':
          void ws.toggleEditorMinimap()
          break
        case 'view.toggleWordWrap':
          void ws.toggleEditorWordWrap()
          break
        case 'view.toggleBracketColorization':
          void ws.toggleEditorBracketColorization()
          break
        case 'view.editorFont':
          openSettings('appearance')
          break
        case 'view.alwaysOnTop':
          void toggleAlwaysOnTop()
          break
        case 'view.zoomIn':
          zoomIn()
          break
        case 'view.zoomOut':
          zoomOut()
          break
        case 'view.resetLayout':
          {
            const d = layoutResetDefaults()
            ws.setSidebarWidth(d.sidebarWidth)
            ws.setAiWidth(d.aiWidth)
            ws.setEditorRatio(d.editorRatio)
            ws.pushToast('success', layoutResetToast('all'))
          }
          break
        case 'view.zoomReset':
          zoomReset()
          break
        case 'help.shortcuts':
          setShortcutsOpen(true)
          break
        case 'help.palette':
          setPaletteOpen(true)
          break
        default: {
          const templateId = templateIdFromCommand(command.id)
          if (templateId) emitDataai('dataai:insert-template', { templateId })
          break
        }
      }
    },
    [ws, toggleAlwaysOnTop, zoomIn, zoomOut, zoomReset],
  )

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const meta = event.metaKey || event.ctrlKey
      const key = event.key.toLowerCase()

      if (paletteOpen || shortcutsOpen || settingsOpen || gotoOpen) {
        // Palette / help handle Esc themselves; don't steal other chords.
        return
      }

      if (event.key === 'Escape') {
        const modalOpen = Boolean(ws.dialog) || isUiModalOpen()
        if (!shouldCancelRunOnEscape({ running: ws.running, modalOpen })) return
        event.preventDefault()
        event.stopImmediatePropagation()
        ws.cancelRun()
        return
      }

      if (meta && !event.shiftKey && (key === 'k' || key === 'p')) {
        event.preventDefault()
        setPaletteOpen(true)
        return
      }
      if (meta && event.shiftKey && key === 'p') {
        event.preventDefault()
        setPaletteOpen(true)
        return
      }
      if (event.key === 'F1') {
        event.preventDefault()
        setShortcutsOpen(true)
        return
      }
      if (meta && !event.shiftKey && key === 'g') {
        event.preventDefault()
        setGotoOpen(true)
        return
      }
      if (event.key === 'F5' || (meta && event.key === 'Enter')) {
        event.preventDefault()
        emitDataai('dataai:request-run')
        return
      }
      if (meta && event.shiftKey && key === 'e') {
        event.preventDefault()
        void ws.explain()
        return
      }
      if (event.altKey && event.shiftKey && !meta && key === 'f') {
        event.preventDefault()
        emitDataai('dataai:format-sql')
        return
      }
      if (event.altKey && !event.shiftKey && !meta && key === 'z') {
        event.preventDefault()
        void ws.toggleEditorWordWrap()
        return
      }
      if (meta && event.shiftKey && key === 'f') {
        event.preventDefault()
        if (!ws.sidebarOpen) ws.toggleSidebar()
        window.setTimeout(() => emitDataai('dataai:focus-tree-search'), 40)
        return
      }
      if (meta && event.shiftKey && key === '1') {
        event.preventDefault()
        emitDataai('dataai:focus-editor')
        return
      }
      if (meta && event.shiftKey && key === '2') {
        event.preventDefault()
        emitDataai('dataai:focus-result')
        return
      }
      if (meta && !event.shiftKey && key === 't') {
        event.preventDefault()
        ws.newTab()
        return
      }
      if (meta && event.shiftKey && key === 'd') {
        event.preventDefault()
        if (ws.activeEditor) ws.duplicateTab(ws.activeEditor.id)
        return
      }
      if (meta && event.shiftKey && key === 's') {
        event.preventDefault()
        emitDataai('dataai:save-favorite')
        return
      }
      if (meta && !event.shiftKey && key === 's') {
        event.preventDefault()
        void ws.saveEditorSqlToFile()
        return
      }
      if (meta && !event.shiftKey && key === 'o') {
        event.preventDefault()
        void ws.openSqlFile()
        return
      }
      if (meta && !event.shiftKey && key === 'w') {
        event.preventDefault()
        if (ws.activeEditor) ws.closeTab(ws.activeEditor.id)
        return
      }
      if (meta && !event.shiftKey && key === 'b') {
        event.preventDefault()
        ws.toggleSidebar()
        return
      }
      if (meta && event.shiftKey && key === 'a') {
        event.preventDefault()
        ws.toggleAi()
        return
      }
      if (meta && !event.shiftKey && (key === '=' || key === '+')) {
        event.preventDefault()
        zoomIn()
        return
      }
      if (meta && !event.shiftKey && key === '-') {
        event.preventDefault()
        zoomOut()
        return
      }
      if (meta && !event.shiftKey && key === '0') {
        event.preventDefault()
        zoomReset()
        return
      }
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [ws, paletteOpen, shortcutsOpen, settingsOpen, gotoOpen, zoomIn, zoomOut, zoomReset])

  if (!ws.ready) {
    return (
      <div className="boot">
        <Mark />
        <span>DataAI</span>
      </div>
    )
  }

  const columns = [
    ws.sidebarOpen ? `${ws.sidebarWidth}px` : null,
    ws.sidebarOpen ? '5px' : null,
    'minmax(0, 1fr)',
    ws.aiOpen ? '5px' : null,
    ws.aiOpen ? `${ws.aiWidth}px` : null,
  ]
    .filter(Boolean)
    .join(' ')

  const encryptionLabel =
    ws.meta?.encryption === 'os' ? '密钥：系统' : ws.meta?.encryption === 'unavailable' ? '密钥：不可用' : null

  const lastRunSlow = ws.lastRun ? isSlowQuery(ws.lastRun.elapsedMs, ws.slowQueryMs) : false
  const statementCount = countSqlStatements(ws.activeEditor?.sql)
  const statementCountLabel = sqlStatementCountLabel(statementCount)
  const statementCountTitle =
    statementCountLabel != null ? sqlStatementCountTitle(statementCount) : undefined
  const selectionLabel = editorSelectionStatusLabel(ws.editorSelection)
  const lastRunLabel = ws.lastRun
    ? `${ws.lastRun.kind === 'explain' ? '计划' : '结果'} ${ws.lastRun.rows} 行 · ${formatElapsedMs(ws.lastRun.elapsedMs)}${
        lastRunSlow ? ' · 慢' : ''
      }${ws.lastRun.ok ? '' : ' · 失败'}`
    : null

  const showWelcome = ws.connections.length === 0 && !prefs.welcomeDismissed


  return (
    <div className="app" data-density={prefs.density} data-contrast={prefs.highContrast ? 'high' : 'normal'}>
      <TitleBar
        crumb={ws.breadcrumb}
        crumbColor={resolveTabConnectionColor(ws.activeConnection?.id, ws.connections)}
        crumbClickable={Boolean(ws.activeConnection)}
        onRevealCrumb={() => ws.revealConnectionInTree()}
        version={ws.meta?.version}
        sidebarOpen={ws.sidebarOpen}
        aiOpen={ws.aiOpen}
        alwaysOnTop={prefs.alwaysOnTop}
        zoomLabel={formatZoomPercent(prefs.zoomFactor)}
        notificationUnread={ws.unreadNotificationCount}
        notificationsOpen={notifOpen}
        onToggleSidebar={ws.toggleSidebar}
        onToggleAi={ws.toggleAi}
        onToggleAlwaysOnTop={() => void toggleAlwaysOnTop()}
        onOpenNotifications={() => {
          setNotifOpen((open) => {
            const next = !open
            if (next) ws.markNotificationsRead()
            return next
          })
        }}
        onOpenPalette={() => setPaletteOpen(true)}
        onOpenSettings={() => openSettings('model')}
        onCloseWindow={ws.requestCloseWindow}
        recentTables={ws.recentTables}
        recentQueries={ws.recentQueries}
        onOpenRecentTable={ws.openRecentTable}
        onOpenRecentQuery={ws.openRecentQuery}
        onClearRecent={() => void ws.clearRecent()}
      />
      <NotificationDrawer
        open={notifOpen}
        items={ws.notifications}
        onClose={() => setNotifOpen(false)}
        onClear={() => {
          ws.clearNotifications()
        }}
        onDismiss={ws.dismissNotification}
      />
      {showWelcome ? (
        <WelcomePanel
          version={ws.meta?.version}
          recentTables={ws.recentTables}
          recentQueries={ws.recentQueries}
          onNewConnection={ws.openCreate}
          onRestoreSample={() => void ws.restoreSample()}
          onImportConnections={() => void ws.importConnections()}
          onOpenRecentTable={ws.openRecentTable}
          onOpenRecentQuery={ws.openRecentQuery}
          onDismiss={() => void dismissWelcome()}
        />
      ) : (
      <div className="workspace" style={{ gridTemplateColumns: columns }}>
        {ws.sidebarOpen && <ConnectionPane />}
        {ws.sidebarOpen && (
          <Splitter
            label="调整连接栏宽度"
            onDelta={(delta) => ws.setSidebarWidth(ws.sidebarWidth + delta)}
            onReset={() => {
              ws.setSidebarWidth(layoutResetDefaults().sidebarWidth)
              ws.pushToast('success', layoutResetToast('sidebar'))
            }}
          />
        )}
        <main
          className="stage"
          style={
            ws.activeConnection && isKvDialect(ws.activeConnection.dialect)
              ? { gridTemplateRows: 'minmax(0, 1fr)' }
              : {
                  gridTemplateRows: `minmax(${LAYOUT.editorMinPx}px, ${ws.editorRatio}fr) 5px minmax(${LAYOUT.resultsMinPx}px, 1fr)`,
                }
          }
        >
          {ws.activeConnection && isKvDialect(ws.activeConnection.dialect) ? (
            <RedisPane />
          ) : (
            <>
              <EditorPane />
              <Splitter
                label="调整编辑器高度"
                orientation="horizontal"
                onDelta={(delta) => ws.setEditorRatio(ws.editorRatio + delta / 280)}
                onReset={() => {
                  ws.setEditorRatio(layoutResetDefaults().editorRatio)
                  ws.pushToast('success', layoutResetToast('editor'))
                }}
              />
              <ResultPane />
            </>
          )}
        </main>
        {ws.aiOpen && (
          <Splitter
            label="调整助手宽度"
            onDelta={(delta) => ws.setAiWidth(ws.aiWidth - delta)}
            onReset={() => {
              ws.setAiWidth(layoutResetDefaults().aiWidth)
              ws.pushToast('success', layoutResetToast('ai'))
            }}
          />
        )}
        {ws.aiOpen && <AiPane />}
      </div>
      )}
      <StatusBar
        activeConnection={ws.activeConnection}
        schemaError={ws.schema.some((node) => node.id === ws.activeConnection?.id && node.status === 'error')}
        health={ws.activeConnection ? ws.healthById[ws.activeConnection.id] : undefined}
        cursorLine={ws.cursor.line}
        cursorColumn={ws.cursor.column}
        statementCountLabel={statementCountLabel}
        statementCountTitle={statementCountTitle}
        selectionLabel={selectionLabel}
        readOnlyActive={ws.readOnlyActive}
        globalReadOnly={ws.globalReadOnly}
        connectionReadOnly={Boolean(ws.activeConnection?.readOnly)}
        onToggleGlobalReadOnly={() => void ws.setGlobalReadOnly(!ws.globalReadOnly)}
        txnOpen={ws.txnOpen}
        running={ws.running}
        runningSince={ws.runningSince}
        lastRunLabel={lastRunLabel}
        lastRunOk={ws.lastRun ? ws.lastRun.ok : null}
        lastRunSlow={lastRunSlow}
        encryptionLabel={encryptionLabel}
        modeLabel={ws.meta?.mode === 'preview' ? '界面预览' : '本机'}
        zoomLabel={formatZoomPercent(prefs.zoomFactor)}
        version={ws.meta?.version ?? '3.30.0'}
        onProbeHealth={() => {
          if (ws.activeConnection) void ws.checkConnectionHealth(ws.activeConnection.id, false)
        }}
        onRevealConnection={() => ws.revealConnectionInTree()}
        onOpenPalette={() => setPaletteOpen(true)}
        onOpenShortcuts={() => setShortcutsOpen(true)}
        onOpenGotoLine={() => setGotoOpen(true)}
        lastRunKind={ws.lastRun?.kind ?? null}
        onRerunLast={() => {
          if (statusBarRerunAction(ws.lastRun?.kind) === 'explain') void ws.explain()
          else emitDataai('dataai:request-run')
        }}
        wordWrap={ws.editorWordWrap}
        onToggleWordWrap={() => void ws.toggleEditorWordWrap()}
        minimap={ws.editorMinimap}
        onToggleMinimap={() => void ws.toggleEditorMinimap()}
        onZoomReset={zoomReset}
      />
      <div className="toast-viewport" aria-live="polite">
        {ws.toasts.map((toast) => (
          <button key={toast.id} type="button" className={`toast is-${toast.tone}`} onClick={() => ws.dismissToast(toast.id)}>
            {toast.text}
          </button>
        ))}
      </div>
      <Dialogs />
      <TableStructurePanel />
      <ColumnStatsPanel />
      <ImportWizard />
      <SchemaDiffPanel />
      <CommandPalette
        open={paletteOpen}
        onClose={() => setPaletteOpen(false)}
        onRun={runCommand}
        recentTables={ws.recentTables}
        recentQueries={ws.recentQueries}
        onOpenRecentTable={ws.openRecentTable}
        onOpenRecentQuery={ws.openRecentQuery}
        schema={ws.schema}
        connectionId={ws.activeConnection?.id ?? null}
        connectionName={ws.activeConnection?.name}
        targetTable={ws.targetTable}
        favorites={paletteFavorites}
        onOpenSchemaTable={(item) => ws.openTableQuery(item.connectionId, item.tableName)}
        onOpenSchemaColumn={(item) => ws.openTableStructure(item.connectionId, item.tableName)}
        onInsertFavorite={(sql) => ws.insertFavoriteSql(sql)}
      />
      <ShortcutsHelp open={shortcutsOpen} onClose={() => setShortcutsOpen(false)} />
      <GotoLineDialog
        open={gotoOpen}
        seedLine={ws.cursor.line}
        seedColumn={ws.cursor.column}
        onClose={() => setGotoOpen(false)}
        onGoto={(target) => emitDataai('dataai:goto-line', target)}
      />
      <SettingsCenter
        open={settingsOpen}
        tab={settingsTab}
        onTab={setSettingsTab}
        onClose={() => setSettingsOpen(false)}
        prefs={prefs}
        onPrefs={setPrefs}
      />
    </div>
  )
}

function Splitter({
  onDelta,
  onReset,
  label,
  orientation = 'vertical',
}: {
  onDelta: (delta: number) => void
  /** Double-click restores the default size for this pane. */
  onReset?: () => void
  label: string
  orientation?: 'vertical' | 'horizontal'
}) {
  const last = useRef(0)
  const dragging = useRef(false)
  const [active, setActive] = useState(false)
  const raf = useRef(0)
  const pending = useRef(0)

  const flush = () => {
    raf.current = 0
    const delta = pending.current
    pending.current = 0
    if (delta !== 0) onDelta(delta)
  }

  const down = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) return
    dragging.current = true
    setActive(true)
    last.current = orientation === 'vertical' ? event.clientX : event.clientY
    event.currentTarget.setPointerCapture(event.pointerId)
    document.body.classList.add(orientation === 'vertical' ? 'is-col-resizing' : 'is-row-resizing')
  }
  const move = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!dragging.current || !event.currentTarget.hasPointerCapture(event.pointerId)) return
    const point = orientation === 'vertical' ? event.clientX : event.clientY
    const delta = point - last.current
    last.current = point
    if (delta === 0) return
    pending.current += delta
    if (!raf.current) raf.current = window.requestAnimationFrame(flush)
  }
  const up = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!dragging.current) return
    dragging.current = false
    setActive(false)
    if (raf.current) {
      window.cancelAnimationFrame(raf.current)
      raf.current = 0
    }
    if (pending.current !== 0) flush()
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId)
    }
    document.body.classList.remove('is-col-resizing', 'is-row-resizing')
  }
  return (
    <div
      className={
        active
          ? orientation === 'vertical'
            ? 'splitter is-vertical is-dragging'
            : 'splitter is-horizontal is-dragging'
          : orientation === 'vertical'
            ? 'splitter is-vertical'
            : 'splitter is-horizontal'
      }
      role="separator"
      aria-orientation={orientation}
      aria-label={onReset ? layoutSplitterAriaLabel(label) : label}
      title={onReset ? layoutSplitterAriaLabel(label) : label}
      onPointerDown={down}
      onPointerMove={move}
      onPointerUp={up}
      onPointerCancel={up}
      onDoubleClick={(event) => {
        if (!onReset) return
        event.preventDefault()
        event.stopPropagation()
        onReset()
      }}
    />
  )
}

