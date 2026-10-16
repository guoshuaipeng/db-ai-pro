import { useEffect, useState } from 'react'
import { profileColumn, type ColumnStats } from '@shared/columnStats'
import { identStyle, quoteIdent } from '@shared/sql'
import { getApi } from '../bridge'
import { useWorkspace } from '../state/workspace'

export function ColumnStatsPanel() {
  const ws = useWorkspace()
  const target = ws.columnStatsTarget
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [stats, setStats] = useState<ColumnStats | null>(null)
  const [rowCap, setRowCap] = useState(0)

  useEffect(() => {
    if (!target) {
      setStats(null)
      setError('')
      return
    }
    let cancelled = false
    setLoading(true)
    setError('')
    setStats(null)

    void (async () => {
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
  }, [target])

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

  return (
    <aside className="stats-panel" aria-label="列统计">
      <header className="stats-head">
        <div>
          <p className="structure-kicker">列统计</p>
          <h3>{target.column}</h3>
          <p className="stats-sub">
            {target.source === 'result'
              ? '基于当前结果集'
              : `表 ${target.tableName} · 最多 1000 行抽样`}
          </p>
        </div>
        <button type="button" className="btn btn-ghost tiny-btn" onClick={ws.closeColumnStats}>
          关闭
        </button>
      </header>
      <div className="stats-body">
        {loading && <p className="structure-status">计算中…</p>}
        {error && <p className="field-error">{error}</p>}
        {stats && !loading && (
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
                <strong>{stats.numeric ? '数值' : '文本'}</strong>
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
            <p className="stats-note">已分析 {rowCap.toLocaleString('zh-CN')} 行</p>
            <div className="stats-samples">
              <h4>样例值</h4>
              {stats.samples.length === 0 ? (
                <p className="structure-status">没有非空样例</p>
              ) : (
                <ul>
                  {stats.samples.map((sample) => (
                    <li key={sample}>
                      <code>{sample}</code>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </>
        )}
      </div>
    </aside>
  )
}
