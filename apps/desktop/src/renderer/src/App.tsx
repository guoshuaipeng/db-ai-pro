import { useEffect, useRef, type PointerEvent as ReactPointerEvent } from 'react'
import { IconSidebar, IconSpark, Mark } from './components/icons'
import { ConnectionPane } from './components/ConnectionPane'
import { EditorPane, ResultPane } from './components/EditorPane'
import { AiPane } from './components/AiPane'
import { RedisPane } from './components/RedisPane'
import { Dialogs } from './components/Dialogs'
import { dialectInfo, isKvDialect } from '@shared/types'
import { useWorkspace } from './state/workspace'

export function App() {
  const ws = useWorkspace()

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const meta = event.metaKey || event.ctrlKey
      if (event.key === 'F5' || (meta && event.key === 'Enter')) {
        event.preventDefault()
        void ws.run()
      } else if (meta && event.key.toLowerCase() === 't') {
        event.preventDefault()
        ws.newTab()
      } else if (meta && event.key.toLowerCase() === 'w') {
        event.preventDefault()
        if (ws.activeEditor) ws.closeTab(ws.activeEditor.id)
      } else if (meta && event.key.toLowerCase() === 'b') {
        event.preventDefault()
        ws.toggleSidebar()
      } else if (meta && event.shiftKey && event.key.toLowerCase() === 'a') {
        event.preventDefault()
        ws.toggleAi()
      }
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [ws])

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

  return (
    <div className="app">
      <header className="titlebar">
        <div className="brand">
          <Mark />
          <span className="word">DataAI</span>
        </div>
        <p className="crumb">{ws.breadcrumb}</p>
        <div className="title-actions">
          <button
            type="button"
            className={ws.sidebarOpen ? 'icon-btn is-active' : 'icon-btn'}
            aria-pressed={ws.sidebarOpen}
            aria-label="连接栏"
            onClick={ws.toggleSidebar}
          >
            <IconSidebar />
          </button>
          <button
            type="button"
            className={ws.aiOpen ? 'icon-btn is-active' : 'icon-btn'}
            aria-pressed={ws.aiOpen}
            aria-label="助手"
            onClick={ws.toggleAi}
          >
            <IconSpark />
          </button>
        </div>
      </header>
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
              <span className={`badge badge-${ws.activeConnection.dialect}${dialectInfo(ws.activeConnection.dialect).executable || dialectInfo(ws.activeConnection.dialect).kv ? '' : ' badge-pending'}`}>
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
        <span className="status-spacer" />
        <span className="status-item">{ws.meta?.mode === 'preview' ? '界面预览' : '本机'}</span>
        <span className="status-item">F5 运行</span>
        <span className="status-item">{ws.meta?.version ?? '0.5.0'}</span>
      </footer>
      <div className="toast-viewport" aria-live="polite">
        {ws.toasts.map((toast) => (
          <button key={toast.id} type="button" className={`toast is-${toast.tone}`} onClick={() => ws.dismissToast(toast.id)}>
            {toast.text}
          </button>
        ))}
      </div>
      <Dialogs />
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
