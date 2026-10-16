import { useEffect, useState } from 'react'
import { historyPreview } from '@shared/queryHistory'
import { formatElapsedMs, isSlowQuery } from '@shared/slowQuery'
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

export function HistoryPanel({ open, onClose }: { open: boolean; onClose: () => void }) {
  const ws = useWorkspace()
  const [rows, setRows] = useState<QueryHistoryEntry[]>([])
  const [loading, setLoading] = useState(false)
  const connectionId = ws.activeConnection?.id ?? null

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
      {connectionId && !loading && rows.length > 0 && (
        <ul className="history-list">
          {rows.map((entry) => (
            <li key={entry.id} className={entry.ok ? 'history-item' : 'history-item is-bad'}>
              <button
                type="button"
                className="history-main"
                title={entry.sql}
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
