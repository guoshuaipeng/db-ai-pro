import { useEffect, useState } from 'react'
import { profileColumn, type ColumnStats } from '@shared/columnStats'
import {
  columnStatsAnalyzedNote,
  columnStatsCopiedToast,
  columnStatsCopyLabel,
  columnStatsEmptyBody,
  columnStatsEmptyTitle,
  columnStatsErrorTitle,
  columnStatsKicker,
  columnStatsNullRatioLabel,
  columnStatsRefreshLabel,
  columnStatsSampleCopiedToast,
  columnStatsSamplesEmptyBody,
  columnStatsSamplesEmptyTitle,
  columnStatsSamplesHeading,
  columnStatsSourceResult,
  columnStatsSourceTable,
  columnStatsTypeLabel,
  distinctRatioPercent,
  formatColumnStatsClipboard,
  nullRatioPercent,
  columnStatsDistinctRatioLabel,
} from '@shared/columnStatsUi'
import { identStyle, quoteIdent } from '@shared/sql'
import { getApi } from '../bridge'
import { useWorkspace } from '../state/workspace'
import { EmptyState } from './EmptyState'

export function ColumnStatsPanel() {
  const ws = useWorkspace()
  const target = ws.columnStatsTarget
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [stats, setStats] = useState<ColumnStats | null>(null)
  const [rowCap, setRowCap] = useState(0)
  const [reloadToken, setReloadToken] = useState(0)

  useEffect(() => {
    let cancelled = false
    void (async () => {
      if (!target) {
        setStats(null)
        setError('')
        return
      }
      setLoading(true)
      setError('')
      setStats(null)
      try {
        if (target.source === 'result') {
          const next = profileColumn(target.rows, target.column)
          if (!cancelled) {
            setStats(next)
            setRowCap(target.rows.length)
          }
          return
        }
        const style = identStyle(target.dialect)
        const sql = `SELECT ${quoteIdent(target.column, style)} AS value FROM ${quoteIdent(target.tableName, style)} LIMIT 1000;`
        const results = await getApi().sql.execute({
          connectionId: target.connectionId,
          sql,
        })
        const first = results[0]
        if (!first?.ok || !first.rows) throw new Error(first?.error ?? '没有统计结果')
        const rows = first.rows.map((row) => ({ [target.column]: row.value ?? row[target.column] }))
        const next = profileColumn(rows, target.column)
        if (!cancelled) {
          setStats(next)
          setRowCap(rows.length)
        }
      } catch (reason) {
        if (!cancelled) setError(reason instanceof Error ? reason.message : '统计失败')
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [target, reloadToken])

  useEffect(() => {
    if (!target) return
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault()
        ws.closeColumnStats()
      }
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [target, ws])

  if (!target) return null

  const sourceLabel =
    target.source === 'result' ? columnStatsSourceResult() : columnStatsSourceTable(target.tableName)

  const copySummary = () => {
    if (!stats) {
      ws.pushToast('info', '暂无统计可复制')
      return
    }
    const text = formatColumnStatsClipboard({
      column: target.column,
      sourceLabel,
      stats,
      rowCap,
    })
    void navigator.clipboard.writeText(text).then(
      () => ws.pushToast('success', columnStatsCopiedToast()),
      () => ws.pushToast('error', '复制失败'),
    )
  }

  const copySample = (sample: string) => {
    void navigator.clipboard.writeText(sample).then(
      () => ws.pushToast('success', columnStatsSampleCopiedToast()),
      () => ws.pushToast('error', '复制失败'),
    )
  }

  const emptyRows = Boolean(stats && stats.count === 0)
  const nullRatio = stats ? nullRatioPercent(stats) : 0
  const distinctRatio = stats ? distinctRatioPercent(stats) : 0

  return (
    <aside className="stats-panel" aria-label={columnStatsKicker()}>
      <header className="stats-head">
        <div>
          <p className="structure-kicker">{columnStatsKicker()}</p>
          <h3>{target.column}</h3>
          <p className="stats-sub">{sourceLabel}</p>
        </div>
        <div className="stats-head-actions">
          <button type="button" className="btn btn-ghost tiny-btn" onClick={copySummary} disabled={!stats || loading}>
            {columnStatsCopyLabel()}
          </button>
          <button
            type="button"
            className="btn btn-ghost tiny-btn"
            onClick={() => setReloadToken((n) => n + 1)}
            disabled={loading}
          >
            {columnStatsRefreshLabel()}
          </button>
          <button type="button" className="btn btn-ghost tiny-btn" onClick={ws.closeColumnStats}>
            关闭
          </button>
        </div>
      </header>
      <div className="stats-body">
        {loading ? <p className="structure-status">计算中…</p> : null}
        {error && !loading ? (
          <EmptyState
            compact
            kicker={columnStatsKicker()}
            title={columnStatsErrorTitle()}
            body={error}
            actions={
              <button type="button" className="btn btn-ghost" onClick={() => setReloadToken((n) => n + 1)}>
                {columnStatsRefreshLabel()}
              </button>
            }
          />
        ) : null}
        {!loading && !error && emptyRows ? (
          <EmptyState
            compact
            kicker={columnStatsKicker()}
            title={columnStatsEmptyTitle()}
            body={columnStatsEmptyBody()}
          />
        ) : null}
        {stats && !loading && !error && !emptyRows ? (
          <>
            <ul className="stats-grid">
              <li>
                <span>行数</span>
                <strong>{stats.count}</strong>
              </li>
              <li>
                <span>空值</span>
                <strong>{stats.nulls}</strong>
              </li>
              <li>
                <span>去重</span>
                <strong>{stats.distinct}</strong>
              </li>
              <li>
                <span>类型</span>
                <strong>{columnStatsTypeLabel(stats.numeric)}</strong>
              </li>
              <li>
                <span>最小</span>
                <strong title={stats.min ?? ''}>{stats.min ?? '—'}</strong>
              </li>
              <li>
                <span>最大</span>
                <strong title={stats.max ?? ''}>{stats.max ?? '—'}</strong>
              </li>
            </ul>
            <div className="stats-ratios" aria-label="占比">
              <div className="stats-ratio">
                <div className="stats-ratio-head">
                  <span>{columnStatsNullRatioLabel()}</span>
                  <strong>{nullRatio}%</strong>
                </div>
                <div className="stats-ratio-track" aria-hidden="true">
                  <span className="stats-ratio-fill is-null" style={{ width: `${Math.min(100, nullRatio)}%` }} />
                </div>
              </div>
              <div className="stats-ratio">
                <div className="stats-ratio-head">
                  <span>{columnStatsDistinctRatioLabel()}</span>
                  <strong>{distinctRatio}%</strong>
                </div>
                <div className="stats-ratio-track" aria-hidden="true">
                  <span className="stats-ratio-fill is-distinct" style={{ width: `${Math.min(100, distinctRatio)}%` }} />
                </div>
              </div>
            </div>
            <p className="stats-note">{columnStatsAnalyzedNote(rowCap)}</p>
            <div className="stats-samples">
              <h4>{columnStatsSamplesHeading()}</h4>
              {stats.samples.length === 0 ? (
                <EmptyState
                  compact
                  kicker={columnStatsKicker()}
                  title={columnStatsSamplesEmptyTitle()}
                  body={columnStatsSamplesEmptyBody()}
                />
              ) : (
                <ul>
                  {stats.samples.map((sample) => (
                    <li key={sample}>
                      <button
                        type="button"
                        className="stats-sample-btn"
                        title="点击复制"
                        onClick={() => copySample(sample)}
                      >
                        <code>{sample}</code>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </>
        ) : null}
      </div>
    </aside>
  )
}
