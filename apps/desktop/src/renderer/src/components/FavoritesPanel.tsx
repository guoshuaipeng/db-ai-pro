import { useEffect, useMemo, useState } from 'react'
import { favoritesForConnection, groupFavoritesByFolder } from '@shared/favorites'
import {
  defaultSnippetValues,
  expandSnippet,
  extractSnippetVars,
  hasSnippetVars,
} from '@shared/snippetVars'
import { setSqlDragData } from '@shared/sqlDragDrop'
import type { FavoriteFolder, SqlFavorite } from '@shared/types'
import { IconStar } from './icons'
import { useWorkspace } from '../state/workspace'
import { getApi } from '../bridge'

export function FavoritesPanel({ open, onClose }: { open: boolean; onClose: () => void }) {
  const ws = useWorkspace()
  const api = getApi()
  const [rows, setRows] = useState<SqlFavorite[]>([])
  const [folders, setFolders] = useState<FavoriteFolder[]>([])
  const [loading, setLoading] = useState(false)
  const [name, setName] = useState('')
  const [scope, setScope] = useState<'global' | 'connection'>('global')
  const [folderId, setFolderId] = useState<string>('')
  const [folderDraft, setFolderDraft] = useState('')
  const [renamingId, setRenamingId] = useState<string | null>(null)
  const [renameDraft, setRenameDraft] = useState('')
  const [pending, setPending] = useState<SqlFavorite | null>(null)
  const [varValues, setVarValues] = useState<Record<string, string>>({})
  const connectionId = ws.activeConnection?.id ?? null

  const pendingVars = useMemo(
    () => (pending ? extractSnippetVars(pending.sql) : []),
    [pending],
  )

  const refresh = async () => {
    setLoading(true)
    try {
      const [all, folderRows] = await Promise.all([api.favorites.list(), api.favorites.listFolders()])
      setRows(favoritesForConnection(all, connectionId))
      setFolders(folderRows)
    } catch {
      setRows([])
      setFolders([])
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (!open) return
    void refresh()
  }, [open, connectionId])

  useEffect(() => {
    if (!open) setPending(null)
  }, [open])

  const groups = useMemo(() => groupFavoritesByFolder(rows, folders), [rows, folders])

  if (!open) return null

  const saveCurrent = async () => {
    const sql = ws.activeEditor?.sql?.trim() ?? ''
    if (!sql) return
    const title = name.trim() || `片段 ${(rows.length + 1).toString()}`
    await ws.saveFavorite({
      name: title,
      sql,
      connectionId: scope === 'connection' ? connectionId : null,
      folderId: folderId || null,
    })
    setName('')
    await refresh()
  }

  const createFolder = async () => {
    const title = folderDraft.trim()
    if (!title) return
    await api.favorites.saveFolder({ name: title })
    setFolderDraft('')
    await refresh()
  }

  const commitRename = async (id: string) => {
    const title = renameDraft.trim()
    if (!title) {
      setRenamingId(null)
      return
    }
    await api.favorites.saveFolder({ id, name: title })
    setRenamingId(null)
    await refresh()
  }

  const deleteFolder = async (id: string, label: string) => {
    if (!window.confirm(`删除文件夹「${label}」？其中的片段会移到「未分组」。`)) return
    await api.favorites.removeFolder(id)
    if (folderId === id) setFolderId('')
    await refresh()
  }

  const beginInsert = (entry: SqlFavorite) => {
    if (!hasSnippetVars(entry.sql)) {
      ws.insertFavoriteSql(entry.sql)
      onClose()
      return
    }
    const vars = extractSnippetVars(entry.sql)
    setPending(entry)
    setVarValues(
      defaultSnippetValues(vars, {
        table: ws.targetTable || ws.referenceTable || null,
        limit: '100',
      }),
    )
  }

  const confirmInsert = () => {
    if (!pending) return
    const expanded = expandSnippet(pending.sql, varValues)
    ws.insertFavoriteSql(expanded)
    setPending(null)
    onClose()
  }

  return (
    <aside className="history-panel favorites-panel" aria-label="收藏片段">
      <header className="history-head">
        <div className="history-title">
          <IconStar />
          <span>收藏片段</span>
        </div>
        <div className="history-actions">
          <button type="button" className="tiny-btn btn" onClick={onClose}>
            关闭
          </button>
        </div>
      </header>

      <div className="fav-form">
        <input
          className="fav-input"
          value={name}
          onChange={(event) => setName(event.target.value)}
          placeholder="片段名称（可选）"
          aria-label="片段名称"
        />
        <p className="field-hint fav-var-hint">
          SQL 可用 {'{{table}}'} / {'{{limit}}'} 等占位符；插入时填写。
        </p>
        <div className="fav-scope">
          <label>
            <input
              type="radio"
              name="fav-scope"
              checked={scope === 'global'}
              onChange={() => setScope('global')}
            />
            全局
          </label>
          <label>
            <input
              type="radio"
              name="fav-scope"
              checked={scope === 'connection'}
              onChange={() => setScope('connection')}
              disabled={!connectionId}
            />
            当前连接
          </label>
        </div>
        <label className="fav-folder-pick">
          <span>文件夹</span>
          <select value={folderId} onChange={(e) => setFolderId(e.target.value)} aria-label="收藏到文件夹">
            <option value="">未分组</option>
            {folders.map((folder) => (
              <option key={folder.id} value={folder.id}>
                {folder.name}
              </option>
            ))}
          </select>
        </label>
        <button
          type="button"
          className="btn btn-primary tiny-btn"
          disabled={!ws.activeEditor?.sql?.trim()}
          onClick={() => void saveCurrent()}
        >
          收藏当前 SQL
        </button>
      </div>

      <div className="fav-folder-bar">
        <input
          className="fav-input"
          value={folderDraft}
          onChange={(e) => setFolderDraft(e.target.value)}
          placeholder="新建文件夹名称"
          aria-label="新建文件夹"
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault()
              void createFolder()
            }
          }}
        />
        <button type="button" className="btn btn-ghost tiny-btn" disabled={!folderDraft.trim()} onClick={() => void createFolder()}>
          新建文件夹
        </button>
      </div>

      {loading && <p className="history-empty">载入中…</p>}
      {!loading && rows.length === 0 && folders.length === 0 && (
        <p className="history-empty">
          还没有收藏。把常用语句存成片段，也可先建文件夹归类。SQL 里写 {'{{table}}'}、{'{{limit}}'}{' '}
          等占位符，插入时会弹出填写框。
        </p>
      )}
      {!loading && (rows.length > 0 || folders.length > 0) && (
        <div className="fav-groups">
          {groups.map((group) => {
            const key = group.folder?.id ?? 'ungrouped'
            const title = group.folder?.name ?? '未分组'
            return (
              <section key={key} className="fav-group">
                <header className="fav-group-head">
                  {renamingId === group.folder?.id ? (
                    <input
                      className="fav-input fav-rename"
                      value={renameDraft}
                      autoFocus
                      onChange={(e) => setRenameDraft(e.target.value)}
                      onBlur={() => group.folder && void commitRename(group.folder.id)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' && group.folder) {
                          e.preventDefault()
                          void commitRename(group.folder.id)
                        }
                        if (e.key === 'Escape') setRenamingId(null)
                      }}
                      aria-label="重命名文件夹"
                    />
                  ) : (
                    <strong>{title}</strong>
                  )}
                  <span className="fav-group-count">{group.items.length}</span>
                  {group.folder && renamingId !== group.folder.id && (
                    <div className="fav-group-actions">
                      <button
                        type="button"
                        className="tiny-btn btn"
                        onClick={() => {
                          setRenamingId(group.folder!.id)
                          setRenameDraft(group.folder!.name)
                        }}
                      >
                        改名
                      </button>
                      <button
                        type="button"
                        className="tiny-btn btn"
                        onClick={() => void deleteFolder(group.folder!.id, group.folder!.name)}
                      >
                        删夹
                      </button>
                    </div>
                  )}
                </header>
                {group.items.length === 0 ? (
                  <p className="fav-group-empty">此文件夹暂无片段</p>
                ) : (
                  <ul className="history-list">
                    {group.items.map((entry) => (
                      <li key={entry.id} className="history-item">
                        <button
                          type="button"
                          className="history-main"
                          title={`${entry.sql}（可拖到编辑器插入）`}
                          draggable
                          onDragStart={(event) => {
                            setSqlDragData(event.dataTransfer, entry.sql, 'favorite')
                          }}
                          onClick={() => beginInsert(entry)}
                        >
                          <span className="history-meta">
                            <span className="history-badge is-ok">{entry.connectionId ? '连接' : '全局'}</span>
                            {hasSnippetVars(entry.sql) && (
                              <span className="history-badge is-warn" title="含占位符">
                                变量
                              </span>
                            )}
                            <span className="history-when">{entry.name}</span>
                          </span>
                          <code className="history-sql">{entry.sql.replace(/\s+/g, ' ').slice(0, 96)}</code>
                        </button>
                        <div className="history-item-actions">
                          <select
                            className="fav-move"
                            aria-label="移动到文件夹"
                            value={entry.folderId ?? ''}
                            onChange={(e) => {
                              void ws
                                .saveFavorite({
                                  id: entry.id,
                                  name: entry.name,
                                  sql: entry.sql,
                                  connectionId: entry.connectionId,
                                  folderId: e.target.value || null,
                                })
                                .then(() => refresh())
                            }}
                          >
                            <option value="">未分组</option>
                            {folders.map((folder) => (
                              <option key={folder.id} value={folder.id}>
                                {folder.name}
                              </option>
                            ))}
                          </select>
                          <button
                            type="button"
                            className="tiny-btn btn"
                            onClick={() => {
                              void ws.removeFavorite(entry.id).then(() => refresh())
                            }}
                          >
                            删
                          </button>
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </section>
            )
          })}
        </div>
      )}

      {pending && (
        <div className="overlay snippet-var-overlay" role="presentation" onMouseDown={() => setPending(null)}>
          <div
            className="dialog dialog-wide snippet-var-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="snippet-var-title"
            onMouseDown={(event) => event.stopPropagation()}
          >
            <h2 id="snippet-var-title">填写片段变量</h2>
            <p className="dialog-copy">
              「{pending.name}」含占位符，填入后插入编辑器。
            </p>
            <div className="snippet-var-fields">
              {pendingVars.map((varName, index) => (
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
                        confirmInsert()
                      }
                      if (e.key === 'Escape') {
                        e.preventDefault()
                        setPending(null)
                      }
                    }}
                    aria-label={`变量 ${varName}`}
                  />
                </label>
              ))}
            </div>
            <pre className="snippet-var-preview">{expandSnippet(pending.sql, varValues)}</pre>
            <div className="dialog-actions">
              <button type="button" className="btn btn-ghost" onClick={() => setPending(null)}>
                取消
              </button>
              <button type="button" className="btn btn-primary" onClick={confirmInsert}>
                插入
              </button>
            </div>
          </div>
        </div>
      )}
    </aside>
  )
}
