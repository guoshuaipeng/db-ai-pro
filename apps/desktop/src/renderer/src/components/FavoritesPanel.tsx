import { useEffect, useState } from 'react'
import { favoritesForConnection } from '@shared/favorites'
import type { SqlFavorite } from '@shared/types'
import { IconStar } from './icons'
import { useWorkspace } from '../state/workspace'

export function FavoritesPanel({ open, onClose }: { open: boolean; onClose: () => void }) {
  const ws = useWorkspace()
  const [rows, setRows] = useState<SqlFavorite[]>([])
  const [loading, setLoading] = useState(false)
  const [name, setName] = useState('')
  const [scope, setScope] = useState<'global' | 'connection'>('global')
  const connectionId = ws.activeConnection?.id ?? null

  const refresh = async () => {
    setLoading(true)
    try {
      const all = await ws.listFavorites()
      setRows(favoritesForConnection(all, connectionId))
    } catch {
      setRows([])
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (!open) return
    void refresh()
  }, [open, connectionId])

  if (!open) return null

  const saveCurrent = async () => {
    const sql = ws.activeEditor?.sql?.trim() ?? ''
    if (!sql) {
      return
    }
    const title = name.trim() || `片段 ${(rows.length + 1).toString()}`
    await ws.saveFavorite({
      name: title,
      sql,
      connectionId: scope === 'connection' ? connectionId : null,
    })
    setName('')
    await refresh()
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
        <button
          type="button"
          className="btn btn-primary tiny-btn"
          disabled={!ws.activeEditor?.sql?.trim()}
          onClick={() => void saveCurrent()}
        >
          收藏当前 SQL
        </button>
      </div>

      {loading && <p className="history-empty">载入中…</p>}
      {!loading && rows.length === 0 && <p className="history-empty">还没有收藏。把常用语句存成片段后，一点即可插入编辑器。</p>}
      {!loading && rows.length > 0 && (
        <ul className="history-list">
          {rows.map((entry) => (
            <li key={entry.id} className="history-item">
              <button
                type="button"
                className="history-main"
                title={entry.sql}
                onClick={() => {
                  ws.insertFavoriteSql(entry.sql)
                  onClose()
                }}
              >
                <span className="history-meta">
                  <span className="history-badge is-ok">{entry.connectionId ? '连接' : '全局'}</span>
                  <span className="history-when">{entry.name}</span>
                </span>
                <code className="history-sql">{entry.sql.replace(/\s+/g, ' ').slice(0, 96)}</code>
              </button>
              <div className="history-item-actions">
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
    </aside>
  )
}
