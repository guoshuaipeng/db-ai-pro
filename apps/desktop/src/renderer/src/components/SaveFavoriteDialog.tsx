import { useEffect, useMemo, useRef, useState } from 'react'
import { canSaveFavoriteSql, defaultFavoriteName } from '@shared/favoriteQuickSave'
import {
  saveFavoriteCopiedToast,
  saveFavoriteCopySqlLabel,
  saveFavoriteEmptyBody,
  saveFavoriteEmptyTitle,
  saveFavoriteKicker,
  saveFavoriteLead,
  saveFavoriteNameHint,
  saveFavoriteNameLabel,
  saveFavoritePreviewLabel,
  saveFavoriteScopeConnection,
  saveFavoriteScopeGlobal,
  saveFavoriteScopeLegend,
  saveFavoriteSqlPreview,
  saveFavoriteSqlStats,
  saveFavoriteSubmitLabel,
  saveFavoriteTitle,
} from '@shared/saveFavoriteUi'
import { useWorkspace } from '../state/workspace'
import { EmptyState } from './EmptyState'

type Props = {
  open: boolean
  onClose: () => void
}

/** Quick-save active editor SQL as a favorite snippet. */
export function SaveFavoriteDialog({ open, onClose }: Props) {
  const ws = useWorkspace()
  const inputRef = useRef<HTMLInputElement>(null)
  const [name, setName] = useState('')
  const [scope, setScope] = useState<'global' | 'connection'>('global')
  const [busy, setBusy] = useState(false)

  const sql = ws.activeEditor?.sql ?? ''
  const connectionId = ws.activeConnection?.id ?? null
  const canSave = canSaveFavoriteSql(sql)
  const stats = useMemo(() => saveFavoriteSqlStats(sql), [sql])
  const preview = useMemo(() => saveFavoriteSqlPreview(sql), [sql])

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

  const copySql = () => {
    void navigator.clipboard.writeText(sql.trim()).then(
      () => ws.pushToast('success', saveFavoriteCopiedToast()),
      () => ws.pushToast('error', '复制失败'),
    )
  }

  return (
    <div className="overlay" role="presentation" onMouseDown={onClose}>
      <div
        className="dialog dialog-wide save-favorite-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="save-fav-title"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <h2 id="save-fav-title">{saveFavoriteTitle()}</h2>
        <p className="dialog-copy">{saveFavoriteLead()}</p>
        {!canSave ? (
          <EmptyState
            compact
            kicker={saveFavoriteKicker()}
            title={saveFavoriteEmptyTitle()}
            body={saveFavoriteEmptyBody()}
          />
        ) : (
          <>
            <label className="field">
              <span>
                {saveFavoriteNameLabel()}
                <em className="save-fav-name-hint">{saveFavoriteNameHint(name)}</em>
              </span>
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
              <legend>{saveFavoriteScopeLegend()}</legend>
              <label className="checkline">
                <input
                  type="radio"
                  name="fav-scope"
                  checked={scope === 'global'}
                  onChange={() => setScope('global')}
                />
                {saveFavoriteScopeGlobal()}
              </label>
              <label className="checkline">
                <input
                  type="radio"
                  name="fav-scope"
                  checked={scope === 'connection'}
                  disabled={!connectionId}
                  onChange={() => setScope('connection')}
                />
                {saveFavoriteScopeConnection(ws.activeConnection?.name)}
              </label>
            </fieldset>
            <div className="save-fav-preview-head">
              <span>{saveFavoritePreviewLabel()}</span>
              <span className="save-fav-stats">{stats.label}</span>
              <button type="button" className="btn btn-ghost tiny-btn" onClick={copySql}>
                {saveFavoriteCopySqlLabel()}
              </button>
            </div>
            <pre className="save-fav-preview" aria-label={saveFavoritePreviewLabel()}>
              {preview}
            </pre>
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
            {saveFavoriteSubmitLabel(busy)}
          </button>
        </div>
      </div>
    </div>
  )
}
