import { useEffect, useMemo, useRef, useState } from 'react'
import { emitDataai, onDataai } from '../appEvents'
import { sqlFormatDoneToast, sqlFormatDoneTone } from '@shared/sqlFormatFeedback'
import { pickRunSql, type RunSqlPick } from '@shared/runSqlPick'
import { suggestionsFromSchema } from '@shared/schemaSuggest'
import { IconClock, IconPlay, IconPlus, IconStar, IconStop } from './icons'
import { ScrollTabs, type TabContextAction } from './ScrollTabs'
import { ToolbarOverflow } from './ToolbarOverflow'
import { TabConnectionSelect } from './TabConnectionSelect'
import { SqlEditor } from './SqlEditor'
import { ResultGrid, ResultToolbar } from './ResultGrid'
import { ResultSummaryBar } from './ResultSummaryBar'
import {
  resultMessageCopiedToast,
  resultMessageCopyKind,
  resultMessageCopyText,
} from '@shared/resultMessageCopy'
import { filterResultRows } from '@shared/resultFilter'
import { ResultChart } from './ResultChart'
import { canChartResult } from '@shared/chartData'
import { HistoryPanel } from './HistoryPanel'
import { EmptyState } from './EmptyState'
import { FavoritesPanel } from './FavoritesPanel'
import { SaveFavoriteDialog } from './SaveFavoriteDialog'
import { useWorkspace } from '../state/workspace'
import { pickFocusResultTarget } from '@shared/focusResult'
import { isSlowQuery } from '@shared/slowQuery'
import { QUERY_TEMPLATES, getQueryTemplate, type QueryTemplate } from '@shared/queryTemplates'
import {
  defaultSnippetValues,
  expandSnippet,
  extractSnippetVars,
  hasSnippetVars,
} from '@shared/snippetVars'
import {
  buildQueryParamDefaults,
  rememberQueryParamValues,
  sqlNeedsQueryParams,
} from '@shared/queryParams'
import { QueryParamDialog } from './QueryParamDialog'
import {
  PAGE_SIZES,
  canNextPage,
  canPrevPage,
  formatPageInfo,
  type PageSize,
} from '@shared/tablePaging'
import { isTabDirty, tabTitleWithDirty } from '@shared/tabDirty'
import { resolveTabConnectionColor } from '@shared/tabConnectionColor'

export function EditorPane() {
  const ws = useWorkspace()
  const [historyOpen, setHistoryOpen] = useState(false)
  const [historySlowOnly, setHistorySlowOnly] = useState(false)
  const [favoritesOpen, setFavoritesOpen] = useState(false)
  const [saveFavoriteOpen, setSaveFavoriteOpen] = useState(false)
  const [templatesOpen, setTemplatesOpen] = useState(false)
  const [pendingTemplate, setPendingTemplate] = useState<QueryTemplate | null>(null)
  const [varValues, setVarValues] = useState<Record<string, string>>({})
  const [sessionParamValues, setSessionParamValues] = useState<Record<string, string>>({})
  const [paramDialog, setParamDialog] = useState<'run' | 'fill' | null>(null)
  const runPickRef = useRef<RunSqlPick | null>(null)
  const [paramValues, setParamValues] = useState<Record<string, string>>({})
  const templatesRef = useRef<HTMLDivElement>(null)

  useEffect(() => onDataai('dataai:save-favorite', () => {
    setSaveFavoriteOpen(true)
  }), [])

  useEffect(() => onDataai('dataai:open-favorites', () => {
    setFavoritesOpen(true)
    setHistoryOpen(false)
  }), [])
  useEffect(() => onDataai('dataai:open-history', () => {
    setHistorySlowOnly(false)
    setHistoryOpen(true)
    setFavoritesOpen(false)
  }), [])
  useEffect(() => onDataai('dataai:open-history-slow', () => {
    setHistorySlowOnly(true)
    setHistoryOpen(true)
    setFavoritesOpen(false)
  }), [])
  useEffect(() => {
    return onDataai('dataai:sql-format-done', (detail) => {
      if (!detail) return
      ws.pushToast(sqlFormatDoneTone(detail.changed), sqlFormatDoneToast(detail))
    })
  }, [ws])

  useEffect(() => onDataai('dataai:open-templates', () => {
    setTemplatesOpen(true)
    setFavoritesOpen(false)
    setHistoryOpen(false)
  }), [])
  useEffect(() => {
    if (!templatesOpen) return
    const onDoc = (event: MouseEvent) => {
      if (!templatesRef.current?.contains(event.target as Node)) setTemplatesOpen(false)
    }
    window.addEventListener('mousedown', onDoc)
    return () => window.removeEventListener('mousedown', onDoc)
  }, [templatesOpen])

  const beginTemplate = (tpl: QueryTemplate) => {
    setTemplatesOpen(false)
    if (!hasSnippetVars(tpl.sql)) {
      ws.insertFavoriteSql(tpl.sql)
      return
    }
    setPendingTemplate(tpl)
    setVarValues(
      defaultSnippetValues(extractSnippetVars(tpl.sql), {
        table: ws.targetTable || null,
        limit: '100',
      }),
    )
  }

  const confirmTemplate = () => {
    if (!pendingTemplate) return
    const expanded = expandSnippet(pendingTemplate.sql, varValues)
    setPendingTemplate(null)
    ws.insertFavoriteSql(expanded)
  }


  const peekRunSql = (): Promise<RunSqlPick> =>
    new Promise((resolve) => {
      let settled = false
      const respond = (result: RunSqlPick) => {
        if (settled) return
        settled = true
        resolve(result)
      }
      emitDataai('dataai:peek-run-sql', { respond })
      // Fallback if editor not mounted
      window.setTimeout(() => {
        if (settled) return
        settled = true
        resolve(pickRunSql(ws.activeEditor?.sql ?? '', null))
      }, 50)
    })

  const openParamDialog = async (mode: 'run' | 'fill') => {
    const pick = mode === 'run' ? await peekRunSql() : pickRunSql(ws.activeEditor?.sql ?? '', null)
    if (mode === 'run') runPickRef.current = pick
    else runPickRef.current = null
    const sql = pick.sql
    if (!sql.trim()) {
      ws.pushToast('info', '没有可运行的 SQL')
      return
    }
    if (!sqlNeedsQueryParams(sql)) {
      if (mode === 'run') {
        await ws.runSqlText(sql)
        if (pick.fromSelection) ws.pushToast('info', '已运行选中语句')
      } else window.alert('当前 SQL 没有 {{name}} 占位符')
      return
    }
    setParamValues(
      buildQueryParamDefaults(sql, sessionParamValues, {
        table: ws.targetTable || null,
        limit: '100',
      }),
    )
    setParamDialog(mode)
  }

  const requestRun = () => {
    void openParamDialog('run')
  }

  const confirmParams = (values: Record<string, string>, writeBack: boolean) => {
    const pick = runPickRef.current ?? pickRunSql(ws.activeEditor?.sql ?? '', null)
    runPickRef.current = null
    const sql = pick.sql
    const mode = paramDialog
    setParamDialog(null)
    if (!mode) return
    const expanded = expandSnippet(sql, values)
    setSessionParamValues((prev) => rememberQueryParamValues(prev, values))
    // 选区运行时不写回整份编辑器，避免用选区覆盖全文
    if (writeBack && !pick.fromSelection) ws.updateSql(expanded)
    if (mode === 'run') {
      void ws.runSqlText(expanded).then(() => {
        if (pick.fromSelection) ws.pushToast('info', '已运行选中语句')
      })
    }
  }

  useEffect(
    () =>
      onDataai('dataai:insert-template', (detail) => {
        const tpl = getQueryTemplate(detail.templateId)
        if (!tpl) return
        setTemplatesOpen(false)
        if (!hasSnippetVars(tpl.sql)) {
          ws.insertFavoriteSql(tpl.sql)
          return
        }
        setPendingTemplate(tpl)
        setVarValues(
          defaultSnippetValues(extractSnippetVars(tpl.sql), {
            table: ws.targetTable || null,
            limit: '100',
          }),
        )
      }),
    [ws],
  )

  useEffect(
    () =>
      onDataai('dataai:request-run', () => {
        void openParamDialog('run')
      }),
    // openParamDialog closes over sessionParamValues / ws
    [ws, sessionParamValues],
  )

  useEffect(
    () =>
      onDataai('dataai:fill-query-params', () => {
        const sql = ws.activeEditor?.sql ?? ''
        if (!sqlNeedsQueryParams(sql)) {
          window.alert('当前 SQL 没有 {{name}} 占位符')
          return
        }
        setParamValues(
          buildQueryParamDefaults(sql, sessionParamValues, {
            table: ws.targetTable || null,
            limit: '100',
          }),
        )
        setParamDialog('fill')
      }),
    [ws, sessionParamValues],
  )

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
          label: tabTitleWithDirty(tab.title, isTabDirty(tab)),
          editTitle: tab.title,
          badge: ws.tabDisconnected(tab) ? '断开' : undefined,
          tone: ws.tabDisconnected(tab) ? ('warn' as const) : undefined,
          pinned: tab.pinned === true,
          color: resolveTabConnectionColor(tab.connectionId, ws.connections),
        }))}
        activeId={ws.activeEditor?.id ?? ''}
        onSelect={ws.setActiveEditor}
        onClose={ws.closeTab}
        onRename={ws.renameTab}
        onReorder={ws.reorderEditorTabs}
        onEmptyDoubleClick={ws.newTab}
        onContextAction={(id, action: TabContextAction) => {
          if (action === 'pin' || action === 'unpin') ws.togglePinTab(id)
          else if (action === 'duplicate') ws.duplicateTab(id)
          else if (action === 'close') ws.closeTab(id)
          else if (action === 'close-others') ws.closeOtherTabs(id)
          else if (action === 'close-right') ws.closeTabsToRight(id)
        }}
        trailing={
          <div className="tab-actions tab-actions-slim">
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
                setHistoryOpen((open) => {
                  const next = !open
                  if (next) setHistorySlowOnly(false)
                  return next
                })
                if (!historyOpen) setFavoritesOpen(false)
              }}
            >
              <IconClock />
            </button>
            <button type="button" className="icon-btn" aria-label="新建查询" onClick={ws.newTab}>
              <IconPlus />
            </button>
          </div>
        }
      />
      <div className="editor-toolbar-row">
        <TabConnectionSelect />
        <ToolbarOverflow
          className="editor-toolbar-actions"
          secondary={
          <>
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
            <div className="template-menu" ref={templatesRef}>
              <button
                type="button"
                className={templatesOpen ? 'btn btn-ghost run-btn is-active' : 'btn btn-ghost run-btn'}
                onClick={() => setTemplatesOpen((open) => !open)}
                title="快速查询模板（Ctrl+K「模板」）"
                aria-expanded={templatesOpen}
              >
                模板
              </button>
              {templatesOpen && (
                <div className="template-popover" role="menu" aria-label="查询模板">
                  {QUERY_TEMPLATES.map((tpl) => (
                    <button
                      key={tpl.id}
                      type="button"
                      className="template-row"
                      role="menuitem"
                      onClick={() => beginTemplate(tpl)}
                    >
                      <span className="template-row-title">{tpl.title}</span>
                      <span className="template-row-sub">{tpl.subtitle}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
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
              title="格式化 SQL（Shift+Alt+F；有选区则只格式化选区）"
            >
              格式化
            </button>
            <button
              type="button"
              className={ws.editorWordWrap ? 'btn btn-ghost run-btn is-active' : 'btn btn-ghost run-btn'}
              onClick={() => void ws.toggleEditorWordWrap()}
              aria-pressed={ws.editorWordWrap}
              title="自动换行（Alt+Z）"
            >
              换行
            </button>
            <button
              type="button"
              className="btn btn-ghost run-btn"
              disabled={ws.running || !ws.activeEditor}
              title="填写 {{name}} 参数（运行前也可自动弹出）"
              onClick={() => openParamDialog('fill')}
            >
              填写参数
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
            <button
              type="button"
              className="btn btn-ghost run-btn"
              onClick={() => setSaveFavoriteOpen(true)}
              disabled={!ws.activeEditor?.sql?.trim()}
              title="收藏当前 SQL（Ctrl+Shift+S）"
            >
              收藏
            </button>
          </>
        }
        primary={
          ws.running ? (
            <button
              type="button"
              className="btn btn-danger run-btn"
              onClick={() => ws.cancelRun()}
              title="取消正在执行的查询（Esc）"
            >
              <IconStop />
              取消
            </button>
          ) : (
            <button type="button" className="btn btn-primary run-btn" title="运行（有选区时只跑选中语句）" onClick={() => requestRun()}>
              <IconPlay />
              运行
            </button>
          )
        }
      />
      </div>
      <div className="editor-body">
        {ws.activeEditor && (
          <SqlEditor
            value={ws.activeEditor.sql}
            onChange={ws.updateSql}
            onCursor={ws.setCursor}
            onSelectionChange={ws.setEditorSelection}
            suggestions={suggestions}
            minimap={ws.editorMinimap}
            fontSize={ws.editorFontSize}
            wordWrap={ws.editorWordWrap}
            bracketColorization={ws.editorBracketColorization}
            onOpenDroppedFiles={(items) =>
              ws.openSqlTabsFromTexts(items.map((item) => ({ title: item.name, sql: item.content })))
            }
          />
        )}
        <HistoryPanel open={historyOpen} onClose={() => setHistoryOpen(false)} slowOnlyDefault={historySlowOnly} />
        <FavoritesPanel open={favoritesOpen} onClose={() => setFavoritesOpen(false)} />
        <SaveFavoriteDialog open={saveFavoriteOpen} onClose={() => setSaveFavoriteOpen(false)} />
        {pendingTemplate && (
          <div
            className="palette-overlay"
            role="presentation"
            onMouseDown={(event) => {
              if (event.target === event.currentTarget) setPendingTemplate(null)
            }}
          >
            <div
              className="palette palette-vars"
              role="dialog"
              aria-modal="true"
              aria-label="填写模板变量"
              onMouseDown={(event) => event.stopPropagation()}
            >
              <h2 className="palette-vars-title">填写模板变量</h2>
              <p className="palette-vars-copy">「{pendingTemplate.title}」</p>
              <div className="snippet-var-fields">
                {extractSnippetVars(pendingTemplate.sql).map((varName, index) => (
                  <label key={varName} className="field">
                    <span>{`{{${varName}}}`}</span>
                    <input
                      className="fav-input"
                      value={varValues[varName] ?? ''}
                      autoFocus={index === 0}
                      spellCheck={false}
                      onChange={(e) => setVarValues((prev) => ({ ...prev, [varName]: e.target.value }))}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault()
                          confirmTemplate()
                        }
                        if (e.key === 'Escape') {
                          e.preventDefault()
                          setPendingTemplate(null)
                        }
                      }}
                    />
                  </label>
                ))}
              </div>
              <div className="dialog-actions">
                <button type="button" className="btn btn-ghost" onClick={() => setPendingTemplate(null)}>
                  取消
                </button>
                <button type="button" className="btn btn-primary" onClick={confirmTemplate}>
                  插入编辑器
                </button>
              </div>
            </div>
          </div>
        )}

        <QueryParamDialog
          open={paramDialog != null && Boolean(ws.activeEditor)}
          sql={ws.activeEditor?.sql ?? ''}
          title={paramDialog === 'run' ? '填写参数并运行' : '填写查询参数'}
          initialValues={paramValues}
          primaryLabel={paramDialog === 'run' ? '运行' : '完成'}
          onCancel={() => setParamDialog(null)}
          onConfirm={confirmParams}
        />

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
  const [selectedRows, setSelectedRows] = useState<Record<string, unknown>[]>([])
  const [gridVisibleColumns, setGridVisibleColumns] = useState<string[] | null>(null)

  const chartable =
    active?.kind === 'grid' && active.columns
      ? canChartResult(active.columns, active.rows ?? [])
      : false

  useEffect(() => {
    setView('table')
    setResultFilter('')
    setViewRows(active?.kind === 'grid' ? (active.rows ?? []) : [])
    setSelectedRows([])
    setGridVisibleColumns(null)
  }, [active?.id])

  useEffect(() => {
    return onDataai('dataai:focus-result', () => {
      const pane = document.querySelector('.result-pane') as HTMLElement | null
      const grid = document.querySelector('.result-pane [role="grid"], .result-pane .grid-wrap') as HTMLElement | null
      const messageLog = document.querySelector('.result-pane .message-log') as HTMLElement | null
      const target = pickFocusResultTarget({ grid, messageLog, pane })
      if (!target) return
      if (target.classList.contains('message-log') && !target.hasAttribute('tabindex')) {
        target.tabIndex = -1
      }
      target.focus()
      if (target.classList.contains('result-pane')) {
        target.scrollIntoView({ block: 'nearest' })
      }
    })
  }, [])


  const copyResultMessage = async () => {
    const kind = resultMessageCopyKind(active?.kind, active?.message)
    const text = resultMessageCopyText(active?.message)
    if (kind === 'empty' || !text) {
      ws.pushToast('info', resultMessageCopiedToast('empty'))
      return
    }
    try {
      await navigator.clipboard.writeText(text)
      ws.pushToast('success', resultMessageCopiedToast(kind))
    } catch {
      ws.pushToast('error', '复制失败，请检查剪贴板权限')
    }
  }

  useEffect(() => {
    return onDataai('dataai:result-copy-message', () => {
      void copyResultMessage()
    })
  }, [active?.id, active?.kind, active?.message])


  useEffect(() => {
    if (!chartable && view === 'chart') setView('table')
  }, [chartable, view])

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (!(event.ctrlKey || event.metaKey) || event.shiftKey) return
      if (event.key.toLowerCase() !== 'f') return
      const target = event.target as HTMLElement | null
      const active = document.activeElement as HTMLElement | null
      const inResult =
        Boolean(target?.closest('.result-pane')) || Boolean(active?.closest('.result-pane'))
      if (!inResult) return
      event.preventDefault()
      event.stopPropagation()
      emitDataai('dataai:result-find')
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [])

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
    <section className="result-pane" aria-label="查询结果" tabIndex={-1}>
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
          onClose={(id) => ws.closeResultTab(id)}
          contextActions={['close-others', 'close-right']}
          onContextAction={(id, action) => {
            if (action === 'close-others') ws.closeOtherResultTabs(id)
            else if (action === 'close-right') ws.closeResultTabsToRight(id)
          }}
          trailing={
            <button
              type="button"
              className="btn btn-ghost tiny-btn"
              title="清空当前查询的全部结果标签"
              onClick={() => ws.clearResultTabs()}
            >
              清空
            </button>
          }
        />
      ) : (
        <div className="result-head">
          <span>结果</span>
        </div>
      )}
      {results && results.tabs.length > 0 && active?.kind === 'grid' && active.columns ? (
        <div className="result-toolbar-row">
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
          <ResultToolbar
            columns={gridVisibleColumns ?? active.columns}
            rows={exportRows}
            selectedRows={selectedRows}
            focusColumn={focusColumn}
            filterQuery={resultFilter}
            onFilterQuery={setResultFilter}
            totalRows={(active.rows ?? []).length}
          />
        </div>
      ) : results && results.tabs.length > 0 ? (
        <div className="result-toolbar-row">
          <span className="result-count">
            {active?.kind === 'plan' ? '执行计划' : '输出'}
          </span>
          {(active?.kind === 'message' || active?.kind === 'plan') && (
            <button
              type="button"
              className="btn btn-ghost tiny-btn"
              title={
                active.kind === 'plan'
                  ? '复制执行计划文本到剪贴板'
                  : '复制输出 / 错误信息到剪贴板'
              }
              disabled={!resultMessageCopyText(active.message).trim()}
              onClick={() => void copyResultMessage()}
            >
              复制输出
            </button>
          )}
        </div>
      ) : null}

      {results && (
        <ResultSummaryBar
          kind={
            !active
              ? 'empty'
              : active.kind === 'grid'
                ? 'grid'
                : active.kind === 'plan'
                  ? 'plan'
                  : 'message'
          }
          returnedRows={active?.kind === 'grid' ? (active.rows?.length ?? 0) : undefined}
          shownRows={
            active?.kind === 'grid'
              ? (viewRows.length > 0 || filteredRows.length === 0 ? viewRows.length : filteredRows.length)
              : undefined
          }
          selectedRows={selectedRows.length}
          elapsedMs={lastRun?.elapsedMs}
          slow={slow}
          slowThresholdMs={ws.slowQueryMs}
          affectedRows={lastRun?.affectedRows}
          resultSetCount={gridCount}
        />
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
        <ResultGrid columns={active.columns} rows={filteredRows} key={`${active.id}:table`} onFocusColumn={setFocusColumn} onViewRowsChange={setViewRows} onSelectedRowsChange={setSelectedRows} onVisibleColumnsChange={setGridVisibleColumns} />
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
