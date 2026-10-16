import { useCallback, useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react'
import { emitDataai, onDataai } from './appEvents'
import type { CommandDef } from '@shared/commands'
import { dialectInfo, isKvDialect } from '@shared/types'
import { Mark } from './components/icons'
import { TitleBar } from './components/TitleBar'
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
import { ShortcutsHelp } from './components/ShortcutsHelp'
import { SettingsCenter, type SettingsTab } from './components/SettingsCenter'
import { DEFAULT_PREFS, type AppPrefs } from '@shared/prefs'
import { getApi } from './bridge'
import { useWorkspace } from './state/workspace'

export function App() {
  const ws = useWorkspace()
  const [paletteOpen, setPaletteOpen] = useState(false)
  const [shortcutsOpen, setShortcutsOpen] = useState(false)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [settingsTab, setSettingsTab] = useState<SettingsTab>('model')
  const [prefs, setPrefs] = useState<AppPrefs>(DEFAULT_PREFS)

  const openSettings = (tab: SettingsTab = 'model') => {
    setSettingsTab(tab)
    setSettingsOpen(true)
  }

  useEffect(() => onDataai('dataai:open-ai-settings', () => openSettings('model')), [])

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

  const runCommand = useCallback(
    (command: CommandDef) => {
      switch (command.id) {
        case 'query.new':
          ws.newTab()
          break
        case 'query.run':
          void ws.run()
          break
        case 'query.explain':
          void ws.explain()
          break
        case 'query.favorites':
          emitDataai('dataai:open-favorites')
          break
        case 'query.history':
          emitDataai('dataai:open-history')
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
        case 'query.format':
          emitDataai('dataai:format-sql')
          break
        case 'editor.find':
          emitDataai('dataai:find')
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
        case 'view.toggleSidebar':
          ws.toggleSidebar()
          break
        case 'view.toggleAi':
          ws.toggleAi()
          break
        case 'connection.new':
          ws.openCreate()
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
        case 'help.shortcuts':
          setShortcutsOpen(true)
          break
        case 'help.palette':
          setPaletteOpen(true)
          break
        default:
          break
      }
    },
    [ws],
  )

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const meta = event.metaKey || event.ctrlKey
      const key = event.key.toLowerCase()

      if (paletteOpen || shortcutsOpen || settingsOpen) {
        // Palette / help handle Esc themselves; don't steal other chords.
        return
      }

      if (meta && !event.shiftKey && key === 'k') {
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
      if (event.key === 'F5' || (meta && event.key === 'Enter')) {
        event.preventDefault()
        void ws.run()
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
      if (meta && !event.shiftKey && key === 't') {
        event.preventDefault()
        ws.newTab()
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
      }
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [ws, paletteOpen, shortcutsOpen, settingsOpen])

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

  const lastRunLabel = ws.lastRun
    ? `${ws.lastRun.kind === 'explain' ? '计划' : '结果'} ${ws.lastRun.rows} 行 · ${ws.lastRun.elapsedMs} ms${
        ws.lastRun.ok ? '' : ' · 失败'
      }`
    : null

  return (
    <div className="app" data-density={prefs.density}>
      <TitleBar
        crumb={ws.breadcrumb}
        version={ws.meta?.version}
        sidebarOpen={ws.sidebarOpen}
        aiOpen={ws.aiOpen}
        onToggleSidebar={ws.toggleSidebar}
        onToggleAi={ws.toggleAi}
        onOpenPalette={() => setPaletteOpen(true)}
        onOpenSettings={() => openSettings('model')}
      />
      <div className="workspace" style={{ gridTemplateColumns: columns }}>
        {ws.sidebarOpen && <ConnectionPane />}
        {ws.sidebarOpen && (
          <Splitter
            label="调整连接栏宽度"
            onDelta={(delta) => ws.setSidebarWidth(Math.min(420, Math.max(220, ws.sidebarWidth + delta)))}
          />
        )}
        <main
          className="stage"
          style={
            ws.activeConnection && isKvDialect(ws.activeConnection.dialect)
              ? { gridTemplateRows: 'minmax(0, 1fr)' }
              : { gridTemplateRows: `minmax(180px, ${ws.editorRatio}fr) 5px minmax(160px, 1fr)` }
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
                onDelta={(delta) => ws.setEditorRatio(Math.min(3.2, Math.max(0.6, ws.editorRatio + delta / 280)))}
              />
              <ResultPane />
            </>
          )}
        </main>
        {ws.aiOpen && (
          <Splitter
            label="调整助手宽度"
            onDelta={(delta) => ws.setAiWidth(Math.min(520, Math.max(300, ws.aiWidth - delta)))}
          />
        )}
        {ws.aiOpen && <AiPane />}
      </div>
      <footer className="statusbar">
        <span className="status-item">
          <span
            className={
              ws.schema.some((node) => node.id === ws.activeConnection?.id && node.status === 'error')
                ? 'status-dot is-bad'
                : ws.activeConnection
                  ? 'status-dot is-on'
                  : 'status-dot'
            }
          />
          {ws.activeConnection ? (
            <>
              <span
                className={`badge badge-${ws.activeConnection.dialect}${
                  dialectInfo(ws.activeConnection.dialect).executable || dialectInfo(ws.activeConnection.dialect).kv
                    ? ''
                    : ' badge-pending'
                }`}
              >
                {dialectInfo(ws.activeConnection.dialect).label}
              </span>
              {ws.activeConnection.name}
            </>
          ) : (
            '未连接'
          )}
        </span>
        <span className="status-item">
          行 {ws.cursor.line} · 列 {ws.cursor.column}
        </span>
        {ws.txnOpen ? (
          <span className="status-item is-txn" aria-live="polite" title="当前连接处于手动事务中">
            事务中
          </span>
        ) : null}
        {ws.running ? (
          <span className="status-item is-running" aria-live="polite">
            <span className="status-pulse" />
            执行中…
          </span>
        ) : lastRunLabel ? (
          <span className={ws.lastRun?.ok === false ? 'status-item is-warn' : 'status-item'}>{lastRunLabel}</span>
        ) : null}
        <span className="status-spacer" />
        {encryptionLabel && <span className="status-item status-muted">{encryptionLabel}</span>}
        <span className="status-item">{ws.meta?.mode === 'preview' ? '界面预览' : '本机'}</span>
        <span className="status-item status-muted">Ctrl+K</span>
        <span className="status-item">{ws.meta?.version ?? '1.1.0'}</span>
      </footer>
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
      <CommandPalette open={paletteOpen} onClose={() => setPaletteOpen(false)} onRun={runCommand} />
      <ShortcutsHelp open={shortcutsOpen} onClose={() => setShortcutsOpen(false)} />
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
  label,
  orientation = 'vertical',
}: {
  onDelta: (delta: number) => void
  label: string
  orientation?: 'vertical' | 'horizontal'
}) {
  const last = useRef(0)
  const down = (event: ReactPointerEvent<HTMLDivElement>) => {
    last.current = orientation === 'vertical' ? event.clientX : event.clientY
    event.currentTarget.setPointerCapture(event.pointerId)
  }
  const move = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!event.currentTarget.hasPointerCapture(event.pointerId)) return
    const point = orientation === 'vertical' ? event.clientX : event.clientY
    const delta = point - last.current
    last.current = point
    if (delta !== 0) onDelta(delta)
  }
  return (
    <div
      className={orientation === 'vertical' ? 'splitter is-vertical' : 'splitter is-horizontal'}
      role="separator"
      aria-orientation={orientation}
      aria-label={label}
      onPointerDown={down}
      onPointerMove={move}
    />
  )
}

