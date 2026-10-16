import { useEffect, useMemo, useState } from 'react'
import { buildCellPreview, cellPreviewTitle } from '@shared/cellValuePreview'
import {
  cellPreviewBinaryBody,
  cellPreviewBinaryTitle,
  cellPreviewClipboardText,
  cellPreviewCopiedToast,
  cellPreviewCopyLabel,
  cellPreviewEmptyBody,
  cellPreviewEmptyTitle,
  cellPreviewFindCount,
  cellPreviewFindLabel,
  cellPreviewKicker,
  cellPreviewLead,
  cellPreviewNullBody,
  cellPreviewNullTitle,
  cellPreviewStats,
  cellPreviewWrapOffLabel,
  cellPreviewWrapOnLabel,
  countPreviewFindHits,
} from '@shared/cellPreviewUi'
import { useWorkspace } from '../state/workspace'
import { EmptyState } from './EmptyState'

export function CellValuePreviewDialog({
  open,
  column,
  rowIndex,
  value,
  onClose,
}: {
  open: boolean
  column: string
  rowIndex: number
  value: unknown
  onClose: () => void
}) {
  const ws = useWorkspace()
  const [wrap, setWrap] = useState(true)
  const [findQuery, setFindQuery] = useState('')
  const preview = useMemo(() => buildCellPreview(value), [value])
  const stats = useMemo(() => cellPreviewStats(preview.text), [preview.text])
  const findHits = useMemo(
    () => countPreviewFindHits(preview.text, findQuery),
    [preview.text, findQuery],
  )

  useEffect(() => {
    if (!open) return
    setWrap(true)
    setFindQuery('')
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

  const isBinary = preview.text === '二进制' && !preview.isNull && !preview.isEmpty && !preview.jsonPretty

  const copy = () => {
    void navigator.clipboard.writeText(cellPreviewClipboardText(preview)).then(
      () => ws.pushToast('success', cellPreviewCopiedToast()),
      () => ws.pushToast('error', '复制失败'),
    )
  }

  const showEmptyState = preview.isNull || preview.isEmpty || isBinary

  return (
    <div className="overlay cell-preview-overlay" role="presentation" onMouseDown={onClose}>
      <div
        className="dialog dialog-wide cell-preview-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="cell-preview-title"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <h2 id="cell-preview-title">{cellPreviewTitle(column, rowIndex)}</h2>
        <p className="dialog-copy">{cellPreviewLead(preview)}</p>
        {showEmptyState ? (
          <EmptyState
            compact
            kicker={cellPreviewKicker()}
            title={
              preview.isNull
                ? cellPreviewNullTitle()
                : preview.isEmpty
                  ? cellPreviewEmptyTitle()
                  : cellPreviewBinaryTitle()
            }
            body={
              preview.isNull
                ? cellPreviewNullBody()
                : preview.isEmpty
                  ? cellPreviewEmptyBody()
                  : cellPreviewBinaryBody()
            }
          />
        ) : (
          <>
            <div className="cell-preview-toolbar">
              <span className="cell-preview-stats">{stats.label}</span>
              <label className="cell-preview-find">
                <span className="sr-only">{cellPreviewFindLabel()}</span>
                <input
                  value={findQuery}
                  onChange={(event) => setFindQuery(event.target.value)}
                  placeholder={cellPreviewFindLabel()}
                  spellCheck={false}
                  aria-label={cellPreviewFindLabel()}
                />
                {findQuery.trim() ? (
                  <span className="cell-preview-find-count">{cellPreviewFindCount(findHits)}</span>
                ) : null}
              </label>
              <button
                type="button"
                className={wrap ? 'btn btn-ghost tiny-btn is-active' : 'btn btn-ghost tiny-btn'}
                aria-pressed={wrap}
                onClick={() => setWrap((value) => !value)}
              >
                {wrap ? cellPreviewWrapOnLabel() : cellPreviewWrapOffLabel()}
              </button>
            </div>
            <pre
              className={
                wrap ? 'cell-preview-body is-wrap' : 'cell-preview-body is-nowrap'
              }
              tabIndex={0}
            >
              {preview.text}
            </pre>
          </>
        )}
        <div className="dialog-actions">
          <button type="button" className="btn btn-ghost" onClick={() => void copy()}>
            {cellPreviewCopyLabel()}
          </button>
          <button type="button" className="btn btn-primary" onClick={onClose}>
            关闭
          </button>
        </div>
      </div>
    </div>
  )
}
