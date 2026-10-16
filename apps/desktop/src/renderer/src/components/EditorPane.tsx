import { useEffect, useMemo, useState } from 'react'
import { emitDataai, onDataai } from '../appEvents'
import { suggestionsFromSchema } from '@shared/schemaSuggest'
import { IconClock, IconPlay, IconPlus, IconStar, IconStop } from './icons'
import { ScrollTabs } from './ScrollTabs'
import { SqlEditor } from './SqlEditor'
import { ResultGrid, ResultToolbar } from './ResultGrid'
import { filterResultRows } from '@shared/resultFilter'
import { ResultChart } from './ResultChart'
import { canChartResult } from '@shared/chartData'
import { HistoryPanel } from './HistoryPanel'
import { EmptyState } from './EmptyState'
import { FavoritesPanel } from './FavoritesPanel'
import { useWorkspace } from '../state/workspace'
import { formatElapsedMs, isSlowQuery } from '@shared/slowQuery'
import {
  PAGE_SIZES,
  canNextPage,
  canPrevPage,
  formatPageInfo,
  type PageSize,
} from '@shared/tablePaging'

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
        tabs={ws.editorTabs.map((tab) => ({
          id: tab.id,
          label: tab.title,
          badge: ws.tabDisconnected(tab) ? '断开' : undefined,
          tone: ws.tabDisconnected(tab) ? ('warn' as const) : undefined,
        }))}
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
            {ws.txnSupported && (
              <>
                <button
                  type="button"
                  className="btn btn-ghost run-btn"
                  onClick={() => void ws.beginTxn()}
                  disabled={ws.running || ws.txnOpen}
                  title="BEGIN · 开始事务"
                >
                  开始事务
                </button>
                <button
                  type="button"
                  className="btn btn-ghost run-btn"
                  onClick={() => void ws.commitTxn()}
                  disabled={ws.running || !ws.txnOpen}
                  title="COMMIT · 提交事务"
                >
                  提交
                </button>
                <button
                  type="button"
                  className="btn btn-ghost run-btn"
                  onClick={() => void ws.rollbackTxn()}
                  disabled={ws.running || !ws.txnOpen}
                  title="ROLLBACK · 回滚事务"
                >
                  回滚
                </button>
              </>
            )}
            <button
              type="button"
              className="btn btn-ghost run-btn"
              onClick={() => emitDataai('dataai:toggle-comment')}
              disabled={ws.running}
              title="切换行注释（Ctrl+/）"
            >
              注释
            </button>
            <button
              type="button"
              className="btn btn-ghost run-btn"
              onClick={() => emitDataai('dataai:format-sql')}
              disabled={ws.running}
              title="格式化 SQL（Shift+Alt+F）"
            >
              格式化
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
            minimap={ws.editorMinimap}
            fontSize={ws.editorFontSize}
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
  const [view, setView] = useState<'table' | 'chart'>('table')
  const [focusColumn, setFocusColumn] = useState<string | null>(null)
  const [resultFilter, setResultFilter] = useState('')
  const [viewRows, setViewRows] = useState<Record<string, unknown>[]>([])

  const chartable =
    active?.kind === 'grid' && active.columns
      ? canChartResult(active.columns, active.rows ?? [])
      : false

  useEffect(() => {
    setView('table')
    setResultFilter('')
    setViewRows(active?.kind === 'grid' ? (active.rows ?? []) : [])
  }, [active?.id])

  useEffect(() => {
    if (!chartable && view === 'chart') setView('table')
  }, [chartable, view])

  const gridCount = results?.tabs.filter((tab) => tab.kind === 'grid').length ?? 0

  const filteredRows = useMemo(() => {
    if (!active?.columns || active.kind !== 'grid') return []
    return filterResultRows(active.rows ?? [], resultFilter, active.columns)
  }, [active?.columns, active?.kind, active?.rows, resultFilter])

  useEffect(() => {
    setViewRows(filteredRows)
  }, [filteredRows])

  const exportRows = viewRows.length > 0 || filteredRows.length === 0 ? viewRows : filteredRows
  const lastRun = ws.lastRun
  const slow = lastRun ? isSlowQuery(lastRun.elapsedMs, ws.slowQueryMs) : false

  const browse = ws.activeEditor?.browse
  const browseInfo = browse ? formatPageInfo(browse) : ''
  const pageRows = active?.kind === 'grid' ? (active.rows?.length ?? 0) : 0
  const nextEnabled = browse
    ? canNextPage(browse) && !(browse.totalRows == null && pageRows < browse.pageSize)
    : false

  return (
    <section className="result-pane" aria-label="查询结果">
      {browse && (
        <div className="browse-pager" role="toolbar" aria-label="表数据分页">
          <button
            type="button"
            className="btn btn-ghost tiny-btn"
            disabled={ws.running || !canPrevPage(browse)}
            onClick={() => ws.setBrowsePage(browse.page - 1)}
            title="上一页"
          >
            上一页
          </button>
          <button
            type="button"
            className="btn btn-ghost tiny-btn"
            disabled={ws.running || !nextEnabled}
            onClick={() => ws.setBrowsePage(browse.page + 1)}
            title="下一页"
          >
            下一页
          </button>
          <label className="browse-page-size">
            <span>每页</span>
            <select
              value={browse.pageSize}
              disabled={ws.running}
              onChange={(event) => ws.setBrowsePageSize(Number(event.target.value) as PageSize)}
              aria-label="每页行数"
            >
              {PAGE_SIZES.map((size) => (
                <option key={size} value={size}>
                  {size}
                </option>
              ))}
            </select>
          </label>
          <span className="browse-page-info" title={browseInfo}>
            {browseInfo}
          </span>
          <button
            type="button"
            className="btn btn-ghost tiny-btn"
            disabled={ws.running}
            onClick={() => ws.refreshBrowse()}
            title="刷新本页"
          >
            刷新
          </button>
        </div>
      )}
      {results && results.tabs.length > 0 ? (
        <ScrollTabs
          label="结果标签"
          tabs={results.tabs.map((tab) => ({ id: tab.id, label: tab.title }))}
          activeId={results.activeId}
          onSelect={ws.setActiveResult}
          trailing={
            active?.kind === 'grid' && active.columns ? (
              <div className="result-trailing">
                {gridCount > 1 && (
                  <span className="result-count result-sets">{gridCount} 个结果集</span>
                )}
                <span className="result-count">{active.rows?.length ?? 0} 行</span>
                {lastRun && (
                  <span
                    className={slow ? 'timing-chip is-slow' : 'timing-chip'}
                    title={
                      slow
                        ? `超过慢查询阈值 ${ws.slowQueryMs} ms`
                        : lastRun.kind === 'explain'
                          ? '执行计划耗时'
                          : '最近一次运行耗时'
                    }
                  >
                    {formatElapsedMs(lastRun.elapsedMs)}
                    {slow ? <span className="timing-slow-flag">慢</span> : null}
                  </span>
                )}
                {chartable && (
                  <div className="result-view-toggle" role="group" aria-label="结果视图">
                    <button
                      type="button"
                      className={view === 'table' ? 'btn btn-ghost tiny-btn is-active' : 'btn btn-ghost tiny-btn'}
                      onClick={() => setView('table')}
                    >
                      表格
                    </button>
                    <button
                      type="button"
                      className={view === 'chart' ? 'btn btn-ghost tiny-btn is-active' : 'btn btn-ghost tiny-btn'}
                      onClick={() => setView('chart')}
                    >
                      图表
                    </button>
                  </div>
                )}
                <ResultToolbar columns={active.columns} rows={exportRows} focusColumn={focusColumn} filterQuery={resultFilter} onFilterQuery={setResultFilter} totalRows={(active.rows ?? []).length} />
              </div>
            ) : (
              <div className="result-trailing">
                <span className="result-count">输出</span>
                {lastRun && (
                  <span className={slow ? 'timing-chip is-slow' : 'timing-chip'}>
                    {formatElapsedMs(lastRun.elapsedMs)}
                    {slow ? <span className="timing-slow-flag">慢</span> : null}
                  </span>
                )}
              </div>
            )
          }
        />
      ) : (
        <div className="result-head">
          <span>结果</span>
          {lastRun && (
            <span className={slow ? 'timing-chip is-slow' : 'timing-chip'}>
              {formatElapsedMs(lastRun.elapsedMs)}
              {slow ? <span className="timing-slow-flag">慢</span> : null}
            </span>
          )}
        </div>
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
      {active?.kind === 'grid' && active.columns && view === 'table' && (
        <ResultGrid columns={active.columns} rows={filteredRows} key={`${active.id}:table`} onFocusColumn={setFocusColumn} onViewRowsChange={setViewRows} />
      )}
      {active?.kind === 'grid' && active.columns && view === 'chart' && chartable && (
        <ResultChart columns={active.columns} rows={active.rows ?? []} key={`${active.id}:chart`} />
      )}
      {active?.kind === 'grid' && active.rows?.length === 0 && view === 'table' && (
        <p className="result-footnote">这条语句没有返回行。</p>
      )}
    </section>
  )
}
