import { useEffect, useMemo, useState } from 'react'
import type { SchemaNode } from '@shared/types'
import type { TableStructure } from '@shared/tableStructure'
import { diffTableColumns, suggestAlterSql, summarizeDiff, type ColumnDiff } from '@shared/schemaDiff'
import { useWorkspace } from '../state/workspace'

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
  // Prefer readable labels with connection name — patched below via enrich
  return out
}

function kindLabel(kind: ColumnDiff['kind']): string {
  if (kind === 'added') return '仅右侧'
  if (kind === 'removed') return '仅左侧'
  if (kind === 'changed') return '有差异'
  return '相同'
}

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

  const keyOf = (t: TablePick) => `${t.connectionId}::${t.tableName}`
  const parseKey = (key: string): TablePick | null => {
    const at = key.indexOf('::')
    if (at < 0) return null
    const connectionId = key.slice(0, at)
    const tableName = key.slice(at + 2)
    return tables.find((t) => t.connectionId === connectionId && t.tableName === tableName) ?? { connectionId, tableName, label: tableName }
  }

  useEffect(() => {
    if (!open) return
    if (seed) {
      const k = `${seed.connectionId}::${seed.tableName}`
      setLeftKey(k)
      const other = tables.find((t) => !(t.connectionId === seed.connectionId && t.tableName === seed.tableName))
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
      setError('请选择左侧与右侧表')
      return
    }
    setLoading(true)
    setError('')
    try {
      const [l, r] = await Promise.all([
        ws.loadTableStructure(left.connectionId, left.tableName),
        ws.loadTableStructure(right.connectionId, right.tableName),
      ])
      setLeftStruct(l)
      setRightStruct(r)
    } catch (reason) {
      setLeftStruct(null)
      setRightStruct(null)
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
  const visible = hideSame ? diffs.filter((d) => d.kind !== 'same') : diffs

  const insertSql = () => {
    if (!leftStruct || !rightStruct) return
    const sql = suggestAlterSql({
      dialect: rightStruct.dialect,
      targetTable: rightStruct.tableName,
      diffs,
    })
    ws.applySql(sql)
    ws.closeSchemaDiff()
  }

  if (!open) return null

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
            <p className="structure-kicker">Schema Diff</p>
            <h2 id="schema-diff-title">表结构对比</h2>
          </div>
          <div className="structure-head-actions">
            <button type="button" className="btn btn-ghost tiny-btn" onClick={ws.closeSchemaDiff}>
              关闭
            </button>
          </div>
        </header>

        <div className="schema-diff-controls">
          <label className="schema-diff-field">
            <span>左侧（参考）</span>
            <select value={leftKey} onChange={(e) => setLeftKey(e.target.value)}>
              <option value="">选择表…</option>
              {tables.map((t) => (
                <option key={`L-${keyOf(t)}`} value={keyOf(t)}>
                  {t.label}
                </option>
              ))}
            </select>
          </label>
          <label className="schema-diff-field">
            <span>右侧（目标）</span>
            <select value={rightKey} onChange={(e) => setRightKey(e.target.value)}>
              <option value="">选择表…</option>
              {tables.map((t) => (
                <option key={`R-${keyOf(t)}`} value={keyOf(t)}>
                  {t.label}
                </option>
              ))}
            </select>
          </label>
          <button type="button" className="btn btn-primary" disabled={loading || !leftKey || !rightKey} onClick={() => void runCompare()}>
            {loading ? '对比中…' : '对比'}
          </button>
        </div>

        <div className="structure-body schema-diff-body">
          {error && <p className="field-error">{error}</p>}
          {!error && !leftStruct && !loading && (
            <p className="structure-status">选择两张表（可跨连接），查看列级差异。建议 ALTER 作用于右侧目标表。</p>
          )}
          {leftStruct && rightStruct && (
            <>
              <div className="schema-diff-summary">
                <span className="schema-diff-pill is-removed">仅左 {summary.removed}</span>
                <span className="schema-diff-pill is-added">仅右 {summary.added}</span>
                <span className="schema-diff-pill is-changed">差异 {summary.changed}</span>
                <span className="schema-diff-pill">相同 {summary.same}</span>
                <label className="schema-diff-hide">
                  <input type="checkbox" checked={hideSame} onChange={(e) => setHideSame(e.target.checked)} />
                  隐藏相同列
                </label>
                <button type="button" className="btn btn-ghost tiny-btn" onClick={insertSql}>
                  插入建议 SQL
                </button>
              </div>
              {visible.length === 0 ? (
                <p className="structure-status">列结构一致（或已全部隐藏）。</p>
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
                          <td>{kindLabel(row.kind)}</td>
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
                          <td>
                            {row.kind === 'changed' && row.changes?.length
                              ? row.changes.join(', ')
                              : row.kind === 'removed'
                                ? '右侧缺少（建议 ADD）'
                                : row.kind === 'added'
                                  ? '左侧没有（建议 DROP）'
                                  : ''}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  )
}
