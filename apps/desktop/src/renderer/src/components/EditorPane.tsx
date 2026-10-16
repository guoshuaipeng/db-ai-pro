import { useEffect, useMemo, useState } from 'react'
import { onDataai } from '../appEvents'
import { suggestionsFromSchema } from '@shared/schemaSuggest'
import { IconClock, IconPlay, IconPlus, IconStar, IconStop } from './icons'
import { ScrollTabs } from './ScrollTabs'
import { SqlEditor } from './SqlEditor'
import { ResultGrid, ResultToolbar } from './ResultGrid'
import { HistoryPanel } from './HistoryPanel'
import { EmptyState } from './EmptyState'
import { FavoritesPanel } from './FavoritesPanel'
import { useWorkspace } from '../state/workspace'

export function EditorPane() {
  const ws = useWorkspace()
  const [historyOpen, setHistoryOpen] = useState(false)
  const [favoritesOpen, setFavoritesOpen] = useState(false)

  useEffect(() => onDataai('dataai:open-favorites', () => {
    setFavoritesOpen(true)
    setHistoryOpen(false)
  }), [])
  useEffect(() => onDataai('dataai:open-history', () => {
    setHistoryOpen(true)
    setFavoritesOpen(false)
  }), [])

  const suggestions = useMemo(
    () => suggestionsFromSchema(ws.schema, ws.activeConnection?.id ?? null),
    [ws.schema, ws.activeConnection?.id],
  )

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
            <button
              type="button"
              className={favoritesOpen ? 'icon-btn is-active' : 'icon-btn'}
              aria-label="收藏片段"
              aria-pressed={favoritesOpen}
              onClick={() => {
                setFavoritesOpen((open) => !open)
                if (!favoritesOpen) setHistoryOpen(false)
              }}
            >
              <IconStar />
            </button>
            <button
              type="button"
              className={historyOpen ? 'icon-btn is-active' : 'icon-btn'}
              aria-label="查询历史"
              aria-pressed={historyOpen}
              onClick={() => {
                setHistoryOpen((open) => !open)
                if (!historyOpen) setFavoritesOpen(false)
              }}
            >
              <IconClock />
            </button>
            <button type="button" className="icon-btn" aria-label="新建查询" onClick={ws.newTab}>
              <IconPlus />
            </button>
            <button
              type="button"
              className="btn btn-ghost run-btn"
              onClick={() => void ws.explain()}
              disabled={ws.running}
              title="EXPLAIN / 执行计划"
            >
              计划
            </button>
            {ws.running ? (
              <button
                type="button"
                className="btn btn-danger run-btn"
                onClick={() => ws.cancelRun()}
                title="取消正在执行的查询"
              >
                <IconStop />
                取消
              </button>
            ) : (
              <button type="button" className="btn btn-primary run-btn" onClick={() => void ws.run()}>
                <IconPlay />
                运行
              </button>
            )}
          </div>
        }
      />
      <div className="editor-body">
        {ws.activeEditor && (
          <SqlEditor
            value={ws.activeEditor.sql}
            onChange={ws.updateSql}
            onCursor={ws.setCursor}
            suggestions={suggestions}
          />
        )}
        <HistoryPanel open={historyOpen} onClose={() => setHistoryOpen(false)} />
        <FavoritesPanel open={favoritesOpen} onClose={() => setFavoritesOpen(false)} />
      </div>
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
        <EmptyState
          compact
          kicker="结果区"
          title="还没有查询结果"
          body="编写 SQL 后按 F5 或 Ctrl+Enter 运行。可用 Ctrl+Shift+E 查看执行计划，Ctrl+Space 补全表与列。"
        />
      )}
      {active?.kind === 'plan' && <pre className="message-log plan-log">{active.message}</pre>}
      {active?.kind === 'message' && <pre className="message-log">{active.message}</pre>}
      {active?.kind === 'grid' && active.columns && (
        <ResultGrid columns={active.columns} rows={active.rows ?? []} key={active.id} />
      )}
      {active?.kind === 'grid' && active.rows?.length === 0 && <p className="result-footnote">这条语句没有返回行。</p>}
    </section>
  )
}
