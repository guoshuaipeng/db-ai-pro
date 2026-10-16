import { useEffect, useMemo, useState } from 'react'
import {
  filterQueryHistory,
  historyFilterEmptyBody,
  historyPreview,
  historySqlCopiedToast,
} from '@shared/queryHistory'
import { setSqlDragData } from '@shared/sqlDragDrop'
import { formatElapsedMs, isSlowQuery } from '@shared/slowQuery'
import {
  countSlowQueryHistory,
  filterSlowQueryHistory,
  SLOW_QUERY_HISTORY_LIMIT,
} from '@shared/slowQueryHistory'
import type { QueryHistoryEntry } from '@shared/types'
import { EmptyState } from './EmptyState'
import { IconClock, IconPlay } from './icons'
import { useWorkspace } from '../state/workspace'

function formatWhen(iso: string): string {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return ''
  const now = new Date()
  const sameDay =
    date.getFullYear() === now.getFullYear() &&
    date.getMonth() === now.getMonth() &&
    date.getDate() === now.getDate()
  const time = date.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', hour12: false })
  if (sameDay) return time
  const day = date.toLocaleDateString('zh-CN', { month: '2-digit', day: '2-digit' })
  return `${day} ${time}`
}

export function HistoryPanel({
  open,
  onClose,
  slowOnlyDefault = false,
}: {
  open: boolean
  onClose: () => void
  /** Open with「仅慢查询」already on (e.g. command palette). */
  slowOnlyDefault?: boolean
}) {
  const ws = useWorkspace()
  const [rows, setRows] = useState<QueryHistoryEntry[]>([])
  const [loading, setLoading] = useState(false)
  const [slowOnly, setSlowOnly] = useState(false)
  const [filterQuery, setFilterQuery] = useState('')
  const [copyNote, setCopyNote] = useState('')
  const connectionId = ws.activeConnection?.id ?? null

  useEffect(() => {
    if (open) {
      setSlowOnly(slowOnlyDefault === true)
      setFilterQuery('')
      setCopyNote('')
    }
  }, [open, slowOnlyDefault])

  useEffect(() => {
    if (!open || !connectionId) {
      setRows([])
      return
    }
    let cancelled = false
    setLoading(true)
    void ws
      .loadHistory(connectionId)
      .then((entries) => {
        if (!cancelled) setRows(entries)
      })
      .catch(() => {
        if (!cancelled) setRows([])
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [open, connectionId, ws])

  const slowCount = useMemo(
    () => countSlowQueryHistory(rows, ws.slowQueryMs),
    [rows, ws.slowQueryMs],
  )
  const scopedRows = useMemo(
    () => (slowOnly ? filterSlowQueryHistory(rows, ws.slowQueryMs, SLOW_QUERY_HISTORY_LIMIT) : rows),
    [rows, slowOnly, ws.slowQueryMs],
  )
  const visibleRows = useMemo(
    () => filterQueryHistory(scopedRows, filterQuery),
    [scopedRows, filterQuery],
  )

  const copySql = async (sql: string) => {
    try {
      await navigator.clipboard.writeText(sql)
      setCopyNote(historySqlCopiedToast())
      window.setTimeout(() => setCopyNote(''), 2000)
    } catch {
      ws.pushToast('error', '复制失败')
    }
  }

  if (!open) return null

  return (
    <aside className="history-panel" aria-label="查询历史">
      <header className="history-head">
        <div className="history-title">
          <IconClock />
          <span>查询历史</span>
          {ws.activeConnection && <span className="history-conn">{ws.activeConnection.name}</span>}
        </div>
        <div className="history-actions">
          <button
            type="button"
            className={slowOnly ? 'tiny-btn btn is-active' : 'tiny-btn btn'}
            disabled={!connectionId}
            aria-pressed={slowOnly}
            title={`仅显示 ≥ ${ws.slowQueryMs} ms 的执行（最多 ${SLOW_QUERY_HISTORY_LIMIT} 条）`}
            onClick={() => setSlowOnly((value) => !value)}
          >
            仅慢查询{slowCount > 0 ? ` ${slowCount}` : ''}
          </button>
          <button
            type="button"
            className="tiny-btn btn"
            disabled={!connectionId || rows.length === 0}
            onClick={() => {
              if (!connectionId) return
              void ws.clearHistory(connectionId).then(() => setRows([]))
            }}
          >
            清空
          </button>
          <button type="button" className="tiny-btn btn" onClick={onClose}>
            关闭
          </button>
        </div>
      </header>

      {connectionId && !loading && rows.length > 0 && (
        <label className="history-filter">
          <span className="history-filter-label">筛选</span>
          <input
            className="history-filter-input"
            value={filterQuery}
            onChange={(event) => setFilterQuery(event.target.value)}
            placeholder="按 SQL / 错误关键字过滤…"
            aria-label="筛选查询历史"
          />
          {filterQuery.trim() && (
            <span className="history-filter-count">
              {visibleRows.length}/{scopedRows.length}
            </span>
          )}
        </label>
      )}
      {copyNote && <p className="history-copy-note" role="status">{copyNote}</p>}

      {!connectionId && (
        <EmptyState
          compact
          title="未选择连接"
          body="先在对象树或标签上选一个连接，再查看该连接的执行历史。"
        />
      )}
      {connectionId && loading && <p className="history-empty">载入中…</p>}
      {connectionId && !loading && rows.length === 0 && (
        <EmptyState
          compact
          title="还没有执行记录"
          body="在此连接上运行 SQL 后，成功与失败的语句会出现在这里，可点开重跑或拖到编辑器。"
        />
      )}
      {connectionId &&
        !loading &&
        rows.length > 0 &&
        scopedRows.length === 0 &&
        !filterQuery.trim() && (
          <EmptyState
            compact
            title="没有慢查询"
            body={`没有超过 ${ws.slowQueryMs.toLocaleString('zh-CN')} ms 的记录（阈值可在设置中调整）。`}
            actions={
              <button type="button" className="btn btn-ghost" onClick={() => setSlowOnly(false)}>
                显示全部历史
              </button>
            }
          />
        )}
      {connectionId && !loading && rows.length > 0 && scopedRows.length > 0 && visibleRows.length === 0 && (
        <EmptyState
          compact
          title="没有匹配的记录"
          body={historyFilterEmptyBody(slowOnly)}
          actions={
            <button type="button" className="btn btn-ghost" onClick={() => setFilterQuery('')}>
              清除筛选
            </button>
          }
        />
      )}
      {connectionId && !loading && visibleRows.length > 0 && (
        <ul className="history-list">
          {visibleRows.map((entry) => (
            <li key={entry.id} className={entry.ok ? 'history-item' : 'history-item is-bad'}>
              <button
                type="button"
                className="history-main"
                title={`${entry.sql}（可拖到编辑器插入）`}
                draggable
                onDragStart={(event) => {
                  setSqlDragData(event.dataTransfer, entry.sql, 'history')
                }}
                onClick={() => {
                  ws.openHistorySql(entry.sql)
                  onClose()
                }}
              >
                <span className="history-meta">
                  <span className={entry.ok ? 'history-badge is-ok' : 'history-badge is-fail'}>
                    {entry.ok ? '成功' : '失败'}
                  </span>
                  <span className="history-when">{formatWhen(entry.createdAt)}</span>
                  {typeof entry.elapsedMs === 'number' && (
                    <span
                      className={
                        isSlowQuery(entry.elapsedMs, ws.slowQueryMs)
                          ? 'history-elapsed is-slow'
                          : 'history-elapsed'
                      }
                      title={
                        isSlowQuery(entry.elapsedMs, ws.slowQueryMs)
                          ? `超过慢查询阈值 ${ws.slowQueryMs} ms`
                          : undefined
                      }
                    >
                      {formatElapsedMs(entry.elapsedMs)}
                      {isSlowQuery(entry.elapsedMs, ws.slowQueryMs) ? (
                        <span className="timing-slow-flag">慢</span>
                      ) : null}
                    </span>
                  )}
                </span>
                <code className="history-sql">{historyPreview(entry.sql)}</code>
                {!entry.ok && entry.error && <span className="history-error">{entry.error}</span>}
              </button>
              <div className="history-item-actions">
                <button
                  type="button"
                  className="tiny-btn btn"
                  aria-label="复制 SQL"
                  title="复制 SQL"
                  onClick={() => void copySql(entry.sql)}
                >
                  复制
                </button>
                <button
                  type="button"
                  className="icon-btn"
                  aria-label="重新运行"
                  title="重新运行"
                  onClick={() => void ws.rerunHistory(entry.sql)}
                >
                  <IconPlay />
                </button>
                <button
                  type="button"
                  className="tiny-btn btn"
                  aria-label="删除这条历史"
                  onClick={() => {
                    void ws.removeHistory(entry.connectionId, entry.id).then(() => {
                      setRows((current) => current.filter((row) => row.id !== entry.id))
                    })
                  }}
                >
                  删
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </aside>
  )
}
