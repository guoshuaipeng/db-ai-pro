import { useEffect, useRef, useState } from 'react'
import { canSaveFavoriteSql, defaultFavoriteName } from '@shared/favoriteQuickSave'
import { useWorkspace } from '../state/workspace'

type Props = {
  open: boolean
  onClose: () => void
}

/** Quick-save active editor SQL as a favorite snippet (M79). */
export function SaveFavoriteDialog({ open, onClose }: Props) {
  const ws = useWorkspace()
  const inputRef = useRef<HTMLInputElement>(null)
  const [name, setName] = useState('')
  const [scope, setScope] = useState<'global' | 'connection'>('global')
  const [busy, setBusy] = useState(false)

  const sql = ws.activeEditor?.sql ?? ''
  const connectionId = ws.activeConnection?.id ?? null
  const canSave = canSaveFavoriteSql(sql)

  useEffect(() => {
    if (!open) return
    setName(defaultFavoriteName(ws.activeEditor?.title, sql))
    setScope(connectionId ? 'connection' : 'global')
    setBusy(false)
    const t = window.setTimeout(() => inputRef.current?.select(), 0)
    return () => window.clearTimeout(t)
  }, [open, ws.activeEditor?.title, ws.activeEditor?.id, sql, connectionId])

  useEffect(() => {
    if (!open) return
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault()
        onClose()
      }
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [open, onClose])

  if (!open) return null

  const submit = async () => {
    if (!canSave || busy) return
    const title = name.trim() || defaultFavoriteName(ws.activeEditor?.title, sql)
    setBusy(true)
    try {
      await ws.saveFavorite({
        name: title,
        sql: sql.trim(),
        connectionId: scope === 'connection' ? connectionId : null,
        folderId: null,
      })
      onClose()
    } catch (error) {
      ws.pushToast('error', error instanceof Error ? error.message : '收藏失败')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="overlay" role="presentation" onMouseDown={onClose}>
      <div
        className="dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="save-fav-title"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <h2 id="save-fav-title">收藏当前 SQL</h2>
        <p className="dialog-copy">保存到片段库，可在收藏面板或命令面板插入。</p>
        {!canSave ? (
          <p className="field-error">当前标签没有可收藏的 SQL。</p>
        ) : (
          <>
            <label className="field">
              <span>名称</span>
              <input
                ref={inputRef}
                value={name}
                onChange={(event) => setName(event.target.value)}
                maxLength={64}
                spellCheck={false}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') {
                    event.preventDefault()
                    void submit()
                  }
                }}
              />
            </label>
            <fieldset className="fav-scope-fieldset">
              <legend>范围</legend>
              <label className="checkline">
                <input
                  type="radio"
                  name="fav-scope"
                  checked={scope === 'global'}
                  onChange={() => setScope('global')}
                />
                全局片段
              </label>
              <label className="checkline">
                <input
                  type="radio"
                  name="fav-scope"
                  checked={scope === 'connection'}
                  disabled={!connectionId}
                  onChange={() => setScope('connection')}
                />
                仅当前连接{ws.activeConnection ? `（${ws.activeConnection.name}）` : ''}
              </label>
            </fieldset>
          </>
        )}
        <div className="dialog-actions">
          <button type="button" className="btn btn-ghost" onClick={onClose}>
            取消
          </button>
          <button
            type="button"
            className="btn btn-primary"
            disabled={!canSave || busy}
            onClick={() => void submit()}
          >
            {busy ? '保存中…' : '收藏'}
          </button>
        </div>
      </div>
    </div>
  )
}
