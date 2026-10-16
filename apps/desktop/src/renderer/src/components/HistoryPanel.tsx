import { useEffect, useMemo, useState } from 'react'
import { historyPreview } from '@shared/queryHistory'
import { setSqlDragData } from '@shared/sqlDragDrop'
import { formatElapsedMs, isSlowQuery } from '@shared/slowQuery'
import {
  countSlowQueryHistory,
  filterSlowQueryHistory,
  SLOW_QUERY_HISTORY_LIMIT,
} from '@shared/slowQueryHistory'
import type { QueryHistoryEntry } from '@shared/types'
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
  const connectionId = ws.activeConnection?.id ?? null

  useEffect(() => {
    if (open) setSlowOnly(slowOnlyDefault === true)
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
  const visibleRows = useMemo(
    () => (slowOnly ? filterSlowQueryHistory(rows, ws.slowQueryMs, SLOW_QUERY_HISTORY_LIMIT) : rows),
    [rows, slowOnly, ws.slowQueryMs],
  )

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
      {!connectionId && <p className="history-empty">先选择一个连接。</p>}
      {connectionId && loading && <p className="history-empty">载入中…</p>}
      {connectionId && !loading && rows.length === 0 && <p className="history-empty">还没有执行记录。</p>}
      {connectionId && !loading && rows.length > 0 && slowOnly && visibleRows.length === 0 && (
        <p className="history-empty">
          没有超过 {ws.slowQueryMs.toLocaleString('zh-CN')} ms 的慢查询（阈值可在设置中调整）。
        </p>
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
