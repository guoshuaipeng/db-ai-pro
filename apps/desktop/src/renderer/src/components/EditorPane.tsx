import { IconPlay, IconPlus } from './icons'
import { ScrollTabs } from './ScrollTabs'
import { SqlEditor } from './SqlEditor'
import { ResultGrid, ResultToolbar } from './ResultGrid'
import { useWorkspace } from '../state/workspace'

export function EditorPane() {
  const ws = useWorkspace()

  return (
    <section className="editor-pane" aria-label="SQL 编辑器">
      <ScrollTabs
        label="查询标签"
        tabs={ws.editorTabs.map((tab) => ({ id: tab.id, label: tab.title }))}
        activeId={ws.activeEditor?.id ?? ''}
        onSelect={ws.setActiveEditor}
        onClose={ws.closeTab}
        trailing={
          <div className="tab-actions">
            <button type="button" className="icon-btn" aria-label="新建查询" onClick={ws.newTab}>
              <IconPlus />
            </button>
            <button type="button" className="btn btn-primary run-btn" onClick={() => void ws.run()} disabled={ws.running}>
              <IconPlay />
              {ws.running ? '执行中' : '运行'}
            </button>
          </div>
        }
      />
      {ws.activeEditor && (
        <SqlEditor value={ws.activeEditor.sql} onChange={ws.updateSql} onCursor={ws.setCursor} />
      )}
    </section>
  )
}

export function ResultPane() {
  const ws = useWorkspace()
  const results = ws.results
  const active = results?.tabs.find((tab) => tab.id === results.activeId) ?? null

  return (
    <section className="result-pane" aria-label="查询结果">
      {results && results.tabs.length > 0 ? (
        <ScrollTabs
          label="结果标签"
          tabs={results.tabs.map((tab) => ({ id: tab.id, label: tab.title }))}
          activeId={results.activeId}
          onSelect={ws.setActiveResult}
          trailing={
            active?.kind === 'grid' && active.columns ? (
              <div className="result-trailing">
                <span className="result-count">{active.rows?.length ?? 0} 行</span>
                <ResultToolbar columns={active.columns} rows={active.rows ?? []} />
              </div>
            ) : (
              <span className="result-count">输出</span>
            )
          }
        />
      ) : (
        <div className="result-head">结果</div>
      )}
      {!results && (
        <div className="result-empty">
          <p>运行当前语句后，结果会显示在这里。</p>
          <p className="hint">F5 或 Ctrl/⌘ Enter</p>
        </div>
      )}
      {active?.kind === 'message' && <pre className="message-log">{active.message}</pre>}
      {active?.kind === 'grid' && active.columns && (
        <ResultGrid columns={active.columns} rows={active.rows ?? []} key={active.id} />
      )}
      {active?.kind === 'grid' && active.rows?.length === 0 && <p className="result-footnote">这条语句没有返回行。</p>}
    </section>
  )
}
