import { useEffect, useState } from 'react'
import type { TableStructure } from '@shared/tableStructure'
import { useWorkspace } from '../state/workspace'

type Tab = 'columns' | 'ddl' | 'indexes'

export function TableStructurePanel() {
  const ws = useWorkspace()
  const target = ws.structureTarget
  const [tab, setTab] = useState<Tab>('columns')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [structure, setStructure] = useState<TableStructure | null>(null)
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    if (!target) {
      setStructure(null)
      setError('')
      return
    }
    let cancelled = false
    setLoading(true)
    setError('')
    setTab('columns')
    setCopied(false)
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
      if (event.key === 'Escape') {
        event.preventDefault()
        ws.closeTableStructure()
      }
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [target, ws])

  if (!target) return null

  const copyDdl = async () => {
    if (!structure?.ddl) return
    await navigator.clipboard.writeText(structure.ddl)
    setCopied(true)
    window.setTimeout(() => setCopied(false), 1800)
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
            </button>
          ))}
        </nav>

        <div className="structure-body">
          {loading && <p className="structure-status">正在读取结构…</p>}
          {error && <p className="field-error">{error}</p>}
          {!loading && !error && structure && tab === 'columns' && (
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
                  </tr>
                </thead>
                <tbody>
                  {structure.columns.map((column) => (
                    <tr key={column.name}>
                      <td className="is-num">{column.ordinal}</td>
                      <td>
                        <code>{column.name}</code>
                      </td>
                      <td className="is-type">{column.dataType || '—'}</td>
                      <td>{column.nullable ? 'YES' : 'NO'}</td>
                      <td className="is-default">{column.defaultValue ?? '—'}</td>
                      <td>{column.primaryKey ? 'PK' : ''}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {!loading && !error && structure && tab === 'indexes' && (
            structure.indexes.length === 0 ? (
              <p className="structure-status">当前驱动未返回索引，或该表没有索引。</p>
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
          {!loading && !error && structure && tab === 'ddl' && (
            <div className="structure-ddl">
              <div className="structure-ddl-bar">
                <span className="structure-ddl-label">{structure.ddlLabel}</span>
                <button type="button" className="btn btn-ghost tiny-btn" disabled={!structure.ddl} onClick={() => void copyDdl()}>
                  {copied ? '已复制' : '复制 DDL'}
                </button>
              </div>
              <pre className="structure-ddl-code">{structure.ddl || '（没有可用的 DDL）'}</pre>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
