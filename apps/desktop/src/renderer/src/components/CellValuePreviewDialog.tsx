import { useEffect, useState } from 'react'
import { buildCellPreview, cellPreviewTitle } from '@shared/cellValuePreview'

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
  const [copyNote, setCopyNote] = useState('')
  const preview = buildCellPreview(value)

  useEffect(() => {
    if (!open) return
    setCopyNote('')
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

  const copy = async () => {
    await navigator.clipboard.writeText(preview.text)
    setCopyNote('已复制')
  }

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
        <p className="dialog-copy">
          只读预览（不写库）
          {preview.jsonPretty ? ' · 已格式化为 JSON' : ''}
          {preview.isNull ? ' · 空值' : ''}
        </p>
        <pre
          className={preview.isNull ? 'cell-preview-body is-null' : 'cell-preview-body'}
          tabIndex={0}
        >
          {preview.text}
        </pre>
        <div className="dialog-actions">
          {copyNote && <span className="cell-preview-copy-note">{copyNote}</span>}
          <button type="button" className="btn btn-ghost" onClick={() => void copy()}>
            复制全文
          </button>
          <button type="button" className="btn btn-primary" onClick={onClose}>
            关闭
          </button>
        </div>
      </div>
    </div>
  )
}
