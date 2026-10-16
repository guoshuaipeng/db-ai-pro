import { useEffect, useMemo, useState } from 'react'
import type { TableStructure } from '@shared/tableStructure'
import {
  filterStructureColumns,
  formatForeignKeyGlance,
  structureColumnsEmptyBody,
  structureDdlAppliedToast,
  structureDdlCopiedToast,
  structureDdlEmptyBody,
  structureIndexesEmptyBody,
  structureRelationsEmptyBody,
  structureTabBadge,
  summarizeStructureDdl,
} from '@shared/tableStructure'
import { useWorkspace } from '../state/workspace'
import { EmptyState } from './EmptyState'
import { SampleFillDialog } from './SampleFillDialog'

type Tab = 'columns' | 'indexes' | 'relations' | 'ddl'

export function TableStructurePanel() {
  const ws = useWorkspace()
  const target = ws.structureTarget
  const [tab, setTab] = useState<Tab>('columns')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [structure, setStructure] = useState<TableStructure | null>(null)
  const [copied, setCopied] = useState(false)
  const [sampleOpen, setSampleOpen] = useState(false)
  const [columnFilter, setColumnFilter] = useState('')

  useEffect(() => {
    if (!target) {
      setStructure(null)
      setError('')
      setColumnFilter('')
      return
    }
    let cancelled = false
    setLoading(true)
    setError('')
    setTab('columns')
    setCopied(false)
    setColumnFilter('')
    void ws
      .loadTableStructure(target.connectionId, target.tableName)
      .then((next) => {
        if (!cancelled) setStructure(next)
      })
      .catch((reason: unknown) => {
        if (!cancelled) setError(reason instanceof Error ? reason.message : '无法读取表结构')
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [target?.connectionId, target?.tableName])

  useEffect(() => {
    if (!target) return
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      event.preventDefault()
      if (tab === 'columns' && columnFilter.trim()) {
        setColumnFilter('')
        return
      }
      ws.closeTableStructure()
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [target, ws, tab, columnFilter])

  const filteredColumns = useMemo(() => {
    if (!structure) return []
    return filterStructureColumns(structure.columns, columnFilter)
  }, [structure, columnFilter])

  const ddlSummary = useMemo(
    () => summarizeStructureDdl(structure?.ddl),
    [structure?.ddl],
  )

  if (!target) return null

  const copyDdl = async () => {
    if (!structure?.ddl?.trim()) {
      ws.pushToast('info', '没有可复制的 DDL')
      return
    }
    try {
      await navigator.clipboard.writeText(structure.ddl)
      setCopied(true)
      ws.pushToast('success', structureDdlCopiedToast())
      window.setTimeout(() => setCopied(false), 1800)
    } catch {
      ws.pushToast('error', '复制失败')
    }
  }

  const applyDdl = () => {
    if (!structure?.ddl?.trim()) {
      ws.pushToast('info', '没有可写入的 DDL')
      return
    }
    ws.applySql(structure.ddl)
    ws.pushToast('success', structureDdlAppliedToast())
  }

  return (
    <div className="overlay structure-overlay" role="presentation" onMouseDown={ws.closeTableStructure}>
      <div
        className="structure-shell"
        role="dialog"
        aria-modal="true"
        aria-labelledby="structure-title"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <header className="structure-head">
          <div>
            <p className="structure-kicker">表结构</p>
            <h2 id="structure-title">{target.tableName}</h2>
          </div>
          <div className="structure-head-actions">
            <button
              type="button"
              className="btn btn-ghost tiny-btn"
              disabled={!structure}
              onClick={() => ws.assertWritable('样例填充') && setSampleOpen(true)}
            >
              样例数据
            </button>
            <button
              type="button"
              className="btn btn-ghost tiny-btn"
              onClick={() => {
                ws.openImportWizard({ connectionId: target.connectionId, tableName: target.tableName })
                ws.closeTableStructure()
              }}
            >
              导入数据
            </button>
            <button
              type="button"
              className="btn btn-ghost tiny-btn"
              onClick={() => {
                ws.openSchemaDiff({ connectionId: target.connectionId, tableName: target.tableName })
                ws.closeTableStructure()
              }}
            >
              对比结构
            </button>
            <button
              type="button"
              className="btn btn-ghost tiny-btn"
              disabled={!structure}
              title="插入方言正确引用的表名到编辑器光标处"
              onClick={() => {
                if (!structure) return
                ws.insertObjectIdent(structure.tableName, structure.dialect)
              }}
            >
              插入表名
            </button>
            <button
              type="button"
              className="btn btn-ghost tiny-btn"
              onClick={() => {
                ws.openTableQuery(target.connectionId, target.tableName)
                ws.closeTableStructure()
              }}
            >
              打开查询
            </button>
            <button type="button" className="btn btn-ghost tiny-btn" onClick={ws.closeTableStructure}>
              关闭
            </button>
          </div>
        </header>

        <nav className="structure-tabs" aria-label="结构分组">
          {(
            [
              { id: 'columns' as const, label: '列' },
              { id: 'indexes' as const, label: '索引' },
              { id: 'relations' as const, label: '关系' },
              { id: 'ddl' as const, label: 'DDL' },
            ] as const
          ).map((item) => (
            <button
              key={item.id}
              type="button"
              className={tab === item.id ? 'structure-tab is-active' : 'structure-tab'}
              onClick={() => setTab(item.id)}
            >
              {item.label}
              {structure ? (
                <span className="structure-tab-count">{structureTabBadge(item.id, structure)}</span>
              ) : null}
            </button>
          ))}
        </nav>

        <div className="structure-body">
          {loading && <p className="structure-status">正在读取结构…</p>}
          {error && <p className="field-error">{error}</p>}

          {!loading && !error && structure && tab === 'columns' && (
            <>
              <div className="structure-filter-bar">
                <label className="history-filter structure-col-filter">
                  <span className="history-filter-label">筛选</span>
                  <input
                    className="history-filter-input"
                    value={columnFilter}
                    onChange={(event) => setColumnFilter(event.target.value)}
                    placeholder="列名 / 类型…"
                    aria-label="筛选列"
                    spellCheck={false}
                  />
                  <span className="history-filter-count">
                    {filteredColumns.length}/{structure.columns.length}
                  </span>
                  {columnFilter.trim() ? (
                    <button type="button" className="btn btn-ghost tiny-btn" onClick={() => setColumnFilter('')}>
                      清除
                    </button>
                  ) : null}
                </label>
              </div>
              {structure.columns.length === 0 || filteredColumns.length === 0 ? (
                <EmptyState
                  compact
                  kicker="列"
                  title={structure.columns.length === 0 ? '没有列信息' : '没有匹配的列'}
                  body={structureColumnsEmptyBody(Boolean(columnFilter.trim()) && structure.columns.length > 0)}
                  actions={
                    columnFilter.trim() ? (
                      <button type="button" className="btn btn-ghost" onClick={() => setColumnFilter('')}>
                        清除筛选
                      </button>
                    ) : null
                  }
                />
              ) : (
                <div className="structure-table-wrap">
                  <table className="structure-table">
                    <thead>
                      <tr>
                        <th scope="col">#</th>
                        <th scope="col">列名</th>
                        <th scope="col">类型</th>
                        <th scope="col">可空</th>
                        <th scope="col">默认值</th>
                        <th scope="col">主键</th>
                        <th scope="col">操作</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredColumns.map((column) => (
                        <tr key={column.name}>
                          <td className="is-num">{column.ordinal}</td>
                          <td>
                            <button
                              type="button"
                              className="structure-ident-hit"
                              title="Alt/Ctrl+单击插入列名"
                              onClick={(event) => {
                                if (event.altKey || event.ctrlKey || event.metaKey) {
                                  event.preventDefault()
                                  ws.insertObjectIdent(column.name, structure.dialect)
                                }
                              }}
                            >
                              <code>{column.name}</code>
                            </button>
                          </td>
                          <td className="is-type">{column.dataType || '—'}</td>
                          <td>{column.nullable ? 'YES' : 'NO'}</td>
                          <td className="is-default">{column.defaultValue ?? '—'}</td>
                          <td>{column.primaryKey ? 'PK' : ''}</td>
                          <td className="structure-col-actions">
                            <button
                              type="button"
                              className="btn btn-ghost tiny-btn"
                              title="插入方言正确引用的列名到编辑器"
                              onClick={() => ws.insertObjectIdent(column.name, structure.dialect)}
                            >
                              插入
                            </button>
                            <button
                              type="button"
                              className="btn btn-ghost tiny-btn"
                              onClick={() =>
                                ws.openColumnStats({
                                  source: 'table',
                                  connectionId: structure.connectionId,
                                  tableName: structure.tableName,
                                  column: column.name,
                                  dialect: structure.dialect,
                                })
                              }
                            >
                              统计
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </>
          )}

          {!loading && !error && structure && tab === 'indexes' && (
            structure.indexes.length === 0 ? (
              <EmptyState
                compact
                kicker="索引"
                title="没有索引"
                body={structureIndexesEmptyBody()}
              />
            ) : (
              <ul className="structure-index-list">
                {structure.indexes.map((index) => (
                  <li key={index.name} className="structure-index-item">
                    <div className="structure-index-main">
                      <strong>{index.name}</strong>
                      <span className="structure-index-flags">
                        {index.primary ? 'PRIMARY' : index.unique ? 'UNIQUE' : 'INDEX'}
                      </span>
                    </div>
                    <code>{index.columns.join(', ') || '—'}</code>
                  </li>
                ))}
              </ul>
            )
          )}

          {!loading && !error && structure && tab === 'relations' && (
            (structure.foreignKeys?.length ?? 0) === 0 ? (
              <EmptyState
                compact
                kicker="关系"
                title="没有外键关系"
                body={structureRelationsEmptyBody()}
              />
            ) : (
              <ul className="structure-index-list structure-fk-list">
                {structure.foreignKeys.map((fk) => (
                  <li key={fk.name} className="structure-index-item structure-fk-item">
                    <div className="structure-index-main">
                      <strong>{fk.name}</strong>
                      <span className="structure-index-flags">FOREIGN KEY</span>
                    </div>
                    <p className="structure-fk-glance">
                      <code>{formatForeignKeyGlance(fk)}</code>
                    </p>
                    {(fk.onUpdate || fk.onDelete) && (
                      <p className="structure-fk-actions-meta">
                        {fk.onUpdate ? `ON UPDATE ${fk.onUpdate}` : ''}
                        {fk.onUpdate && fk.onDelete ? ' · ' : ''}
                        {fk.onDelete ? `ON DELETE ${fk.onDelete}` : ''}
                      </p>
                    )}
                    <div className="structure-fk-nav">
                      <button
                        type="button"
                        className="btn btn-ghost tiny-btn structure-fk-link"
                        onClick={() => {
                          ws.openTableStructure(structure.connectionId, fk.refTable)
                        }}
                        title={`查看表结构：${fk.refTable}`}
                      >
                        结构 · {fk.refTable}
                      </button>
                      <button
                        type="button"
                        className="btn btn-ghost tiny-btn"
                        onClick={() => {
                          ws.openTableQuery(structure.connectionId, fk.refTable)
                          ws.closeTableStructure()
                        }}
                        title={`打开查询：${fk.refTable}`}
                      >
                        查询 · {fk.refTable}
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            )
          )}

          {!loading && !error && structure && tab === 'ddl' && (
            ddlSummary.isEmpty ? (
              <EmptyState
                compact
                kicker="DDL"
                title="没有可用的 DDL"
                body={structureDdlEmptyBody()}
              />
            ) : (
              <div className="structure-ddl">
                <div className="structure-ddl-bar">
                  <span className="structure-ddl-label">{structure.ddlLabel}</span>
                  <span className="structure-ddl-meta">{ddlSummary.statusLabel}</span>
                  <button
                    type="button"
                    className="btn btn-ghost tiny-btn"
                    onClick={() => void copyDdl()}
                  >
                    {copied ? '已复制' : '复制 DDL'}
                  </button>
                  <button type="button" className="btn btn-ghost tiny-btn" onClick={applyDdl}>
                    写入编辑器
                  </button>
                </div>
                <pre className="structure-ddl-code">{structure.ddl}</pre>
              </div>
            )
          )}
        </div>
      </div>
      {sampleOpen && structure && (
        <SampleFillDialog structure={structure} onClose={() => setSampleOpen(false)} />
      )}
    </div>
  )
}
