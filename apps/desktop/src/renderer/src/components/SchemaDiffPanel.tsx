import { useEffect, useMemo, useState } from 'react'
import type { SchemaNode } from '@shared/types'
import type { TableStructure } from '@shared/tableStructure'
import {
  diffTableColumns,
  suggestAlterSql,
  summarizeDiff,
  type ColumnDiff,
  type ColumnDiffKind,
} from '@shared/schemaDiff'
import {
  formatSchemaDiffSummaryClipboard,
  schemaDiffCompareLabel,
  schemaDiffCopySummaryLabel,
  schemaDiffFilteredEmptyBody,
  schemaDiffFilteredEmptyTitle,
  schemaDiffIdleBody,
  schemaDiffIdleTitle,
  schemaDiffInsertSqlLabel,
  schemaDiffKicker,
  schemaDiffKindLabel,
  schemaDiffLead,
  schemaDiffMatchBody,
  schemaDiffMatchTitle,
  schemaDiffNoTablesBody,
  schemaDiffNoTablesTitle,
  schemaDiffRowHint,
  schemaDiffSqlInsertedToast,
  schemaDiffSummaryCopiedToast,
  schemaDiffSwapLabel,
  schemaDiffSwappedToast,
  schemaDiffTitle,
} from '@shared/schemaDiffUi'
import { useWorkspace } from '../state/workspace'
import { EmptyState } from './EmptyState'

type TablePick = { connectionId: string; tableName: string; label: string }

function collectTables(nodes: SchemaNode[]): TablePick[] {
  const out: TablePick[] = []
  const walk = (list: SchemaNode[]) => {
    for (const node of list) {
      if (node.kind === 'table' && node.connectionId && node.tableName) {
        out.push({
          connectionId: node.connectionId,
          tableName: node.tableName,
          label: `${node.connectionId.slice(0, 8)}… / ${node.displayName || node.tableName}`,
        })
      }
      if (node.children?.length) walk(node.children)
    }
  }
  walk(nodes)
  return out
}

type KindFilter = 'all' | ColumnDiffKind

export function SchemaDiffPanel() {
  const ws = useWorkspace()
  const open = ws.schemaDiffOpen
  const seed = ws.schemaDiffSeed

  const tables = useMemo(() => {
    const raw = collectTables(ws.schema)
    return raw.map((item) => {
      const conn = ws.connections.find((c) => c.id === item.connectionId)
      return {
        ...item,
        label: `${conn?.name ?? '连接'} / ${item.tableName}`,
      }
    })
  }, [ws.schema, ws.connections])

  const [leftKey, setLeftKey] = useState('')
  const [rightKey, setRightKey] = useState('')
  const [leftStruct, setLeftStruct] = useState<TableStructure | null>(null)
  const [rightStruct, setRightStruct] = useState<TableStructure | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [hideSame, setHideSame] = useState(true)
  const [kindFilter, setKindFilter] = useState<KindFilter>('all')

  const keyOf = (t: TablePick) => `${t.connectionId}::${t.tableName}`
  const parseKey = (key: string): TablePick | null => {
    const at = key.indexOf('::')
    if (at < 0) return null
    const connectionId = key.slice(0, at)
    const tableName = key.slice(at + 2)
    return (
      tables.find((t) => t.connectionId === connectionId && t.tableName === tableName) ?? {
        connectionId,
        tableName,
        label: tableName,
      }
    )
  }

  useEffect(() => {
    if (!open) return
    if (seed) {
      const k = `${seed.connectionId}::${seed.tableName}`
      setLeftKey(k)
      const other = tables.find(
        (t) => !(t.connectionId === seed.connectionId && t.tableName === seed.tableName),
      )
      if (other) setRightKey(keyOf(other))
      else setRightKey('')
    } else if (!leftKey && tables[0]) {
      setLeftKey(keyOf(tables[0]))
      if (tables[1]) setRightKey(keyOf(tables[1]))
    }
  }, [open, seed?.connectionId, seed?.tableName, tables])

  useEffect(() => {
    if (!open) return
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault()
        ws.closeSchemaDiff()
      }
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [open, ws])

  const runCompare = async () => {
    const left = parseKey(leftKey)
    const right = parseKey(rightKey)
    if (!left || !right) {
      setError('请选择左右两侧的表')
      return
    }
    setLoading(true)
    setError('')
    setLeftStruct(null)
    setRightStruct(null)
    setKindFilter('all')
    try {
      const [leftNext, rightNext] = await Promise.all([
        ws.loadTableStructure(left.connectionId, left.tableName),
        ws.loadTableStructure(right.connectionId, right.tableName),
      ])
      setLeftStruct(leftNext)
      setRightStruct(rightNext)
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : '对比失败')
    } finally {
      setLoading(false)
    }
  }

  const diffs = useMemo(() => {
    if (!leftStruct || !rightStruct) return [] as ColumnDiff[]
    return diffTableColumns(leftStruct.columns, rightStruct.columns)
  }, [leftStruct, rightStruct])

  const summary = useMemo(() => summarizeDiff(diffs), [diffs])

  const visible = useMemo(() => {
    return diffs.filter((row) => {
      if (hideSame && row.kind === 'same') return false
      if (kindFilter !== 'all' && row.kind !== kindFilter) return false
      return true
    })
  }, [diffs, hideSame, kindFilter])

  const leftLabel = parseKey(leftKey)?.label ?? leftKey
  const rightLabel = parseKey(rightKey)?.label ?? rightKey

  const swapSides = () => {
    setLeftKey(rightKey)
    setRightKey(leftKey)
    setLeftStruct(rightStruct)
    setRightStruct(leftStruct)
    ws.pushToast('success', schemaDiffSwappedToast())
  }

  const copySummary = () => {
    if (!leftStruct || !rightStruct) {
      ws.pushToast('info', '请先完成一次对比')
      return
    }
    const text = formatSchemaDiffSummaryClipboard({
      leftLabel,
      rightLabel,
      diffs,
    })
    void navigator.clipboard.writeText(text).then(
      () => ws.pushToast('success', schemaDiffSummaryCopiedToast()),
      () => ws.pushToast('error', '复制失败'),
    )
  }

  const insertSql = () => {
    if (!leftStruct || !rightStruct) return
    const sql = suggestAlterSql({
      dialect: rightStruct.dialect,
      targetTable: rightStruct.tableName,
      diffs,
    })
    ws.applySql(sql)
    ws.pushToast('success', schemaDiffSqlInsertedToast())
    ws.closeSchemaDiff()
  }

  if (!open) return null

  const hasCompared = Boolean(leftStruct && rightStruct)
  const allSame = hasCompared && summary.added === 0 && summary.removed === 0 && summary.changed === 0

  return (
    <div className="overlay structure-overlay" role="presentation" onMouseDown={ws.closeSchemaDiff}>
      <div
        className="structure-shell schema-diff-shell"
        role="dialog"
        aria-modal="true"
        aria-labelledby="schema-diff-title"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <header className="structure-head">
          <div>
            <p className="structure-kicker">{schemaDiffKicker()}</p>
            <h2 id="schema-diff-title">{schemaDiffTitle()}</h2>
          </div>
          <div className="structure-head-actions">
            <button type="button" className="btn btn-ghost tiny-btn" onClick={ws.closeSchemaDiff}>
              关闭
            </button>
          </div>
        </header>

        {tables.length === 0 ? (
          <div className="structure-body schema-diff-body">
            <EmptyState
              kicker={schemaDiffKicker()}
              title={schemaDiffNoTablesTitle()}
              body={schemaDiffNoTablesBody()}
              actions={
                <button type="button" className="btn btn-ghost" onClick={() => void ws.refreshSchemaTree()}>
                  刷新对象树
                </button>
              }
            />
          </div>
        ) : (
          <>
            <p className="schema-diff-lead">{schemaDiffLead()}</p>
            <div className="schema-diff-controls">
              <label className="schema-diff-field">
                <span>左侧（参考）</span>
                <select value={leftKey} onChange={(e) => setLeftKey(e.target.value)} aria-label="左侧参考表">
                  <option value="">选择表…</option>
                  {tables.map((t) => (
                    <option key={`L-${keyOf(t)}`} value={keyOf(t)}>
                      {t.label}
                    </option>
                  ))}
                </select>
              </label>
              <button
                type="button"
                className="btn btn-ghost tiny-btn schema-diff-swap"
                onClick={swapSides}
                disabled={!leftKey && !rightKey}
                title={schemaDiffSwapLabel()}
              >
                {schemaDiffSwapLabel()}
              </button>
              <label className="schema-diff-field">
                <span>右侧（目标）</span>
                <select value={rightKey} onChange={(e) => setRightKey(e.target.value)} aria-label="右侧目标表">
                  <option value="">选择表…</option>
                  {tables.map((t) => (
                    <option key={`R-${keyOf(t)}`} value={keyOf(t)}>
                      {t.label}
                    </option>
                  ))}
                </select>
              </label>
              <button
                type="button"
                className="btn btn-primary"
                disabled={loading || !leftKey || !rightKey}
                onClick={() => void runCompare()}
              >
                {schemaDiffCompareLabel(loading)}
              </button>
            </div>

            <div className="structure-body schema-diff-body">
              {error ? <p className="field-error">{error}</p> : null}
              {!error && !hasCompared && !loading ? (
                <EmptyState
                  compact
                  kicker={schemaDiffKicker()}
                  title={schemaDiffIdleTitle()}
                  body={schemaDiffIdleBody()}
                />
              ) : null}
              {loading ? <p className="structure-status">正在读取两侧表结构…</p> : null}
              {hasCompared ? (
                <>
                  <div className="schema-diff-summary" role="group" aria-label="对比摘要">
                    {(
                      [
                        { id: 'removed' as const, className: 'is-removed', label: `仅左 ${summary.removed}` },
                        { id: 'added' as const, className: 'is-added', label: `仅右 ${summary.added}` },
                        { id: 'changed' as const, className: 'is-changed', label: `差异 ${summary.changed}` },
                        { id: 'same' as const, className: '', label: `相同 ${summary.same}` },
                      ] as const
                    ).map((pill) => (
                      <button
                        key={pill.id}
                        type="button"
                        className={
                          kindFilter === pill.id
                            ? `schema-diff-pill ${pill.className} is-filter-on`
                            : `schema-diff-pill ${pill.className}`.trim()
                        }
                        aria-pressed={kindFilter === pill.id}
                        onClick={() => setKindFilter((cur) => (cur === pill.id ? 'all' : pill.id))}
                        title={`筛选：${schemaDiffKindLabel(pill.id)}`}
                      >
                        {pill.label}
                      </button>
                    ))}
                    <label className="schema-diff-hide">
                      <input
                        type="checkbox"
                        checked={hideSame}
                        onChange={(e) => setHideSame(e.target.checked)}
                      />
                      隐藏相同列
                    </label>
                    <button type="button" className="btn btn-ghost tiny-btn" onClick={copySummary}>
                      {schemaDiffCopySummaryLabel()}
                    </button>
                    <button type="button" className="btn btn-ghost tiny-btn" onClick={insertSql}>
                      {schemaDiffInsertSqlLabel()}
                    </button>
                  </div>
                  {visible.length === 0 ? (
                    <EmptyState
                      compact
                      kicker={schemaDiffKicker()}
                      title={allSame && kindFilter === 'all' ? schemaDiffMatchTitle() : schemaDiffFilteredEmptyTitle()}
                      body={allSame && kindFilter === 'all' ? schemaDiffMatchBody() : schemaDiffFilteredEmptyBody()}
                      actions={
                        hideSame || kindFilter !== 'all' ? (
                          <button
                            type="button"
                            className="btn btn-ghost"
                            onClick={() => {
                              setHideSame(false)
                              setKindFilter('all')
                            }}
                          >
                            显示全部列
                          </button>
                        ) : null
                      }
                    />
                  ) : (
                    <div className="structure-table-wrap">
                      <table className="structure-table schema-diff-table">
                        <thead>
                          <tr>
                            <th scope="col">列</th>
                            <th scope="col">状态</th>
                            <th scope="col">左侧类型</th>
                            <th scope="col">右侧类型</th>
                            <th scope="col">说明</th>
                          </tr>
                        </thead>
                        <tbody>
                          {visible.map((row) => (
                            <tr key={row.name} className={`is-diff-${row.kind}`}>
                              <td>
                                <code>{row.name}</code>
                              </td>
                              <td>{schemaDiffKindLabel(row.kind)}</td>
                              <td className="is-type">
                                {row.left
                                  ? `${row.left.dataType}${row.left.nullable ? '' : ' NOT NULL'}${row.left.primaryKey ? ' PK' : ''}`
                                  : '—'}
                              </td>
                              <td className="is-type">
                                {row.right
                                  ? `${row.right.dataType}${row.right.nullable ? '' : ' NOT NULL'}${row.right.primaryKey ? ' PK' : ''}`
                                  : '—'}
                              </td>
                              <td>{schemaDiffRowHint(row)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </>
              ) : null}
            </div>
          </>
        )}
      </div>
    </div>
  )
}
