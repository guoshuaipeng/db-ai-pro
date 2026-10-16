import { useEffect, useMemo, useState } from 'react'
import {
  EXPORT_FORMAT_LABELS,
  defaultExportColumns,
  defaultExportRowScope,
  exportRowScopeOptionLabel,
  exportRowScopeSummary,
  normalizePickedColumns,
  selectAllExportColumns,
  selectNoneExportColumns,
  togglePickedColumn,
  type ExportFormat,
  type ExportRowScope,
} from '@shared/exportColumnPick'

export function ExportColumnDialog({
  open,
  format,
  columns,
  rowCount,
  selectedRowCount = 0,
  onCancel,
  onConfirm,
}: {
  open: boolean
  format: ExportFormat
  columns: string[]
  /** Filtered visible row count (all scope). */
  rowCount: number
  /** When > 0, offer selected-vs-all scope (defaults to selected). */
  selectedRowCount?: number
  onCancel: () => void
  onConfirm: (picked: string[], rowScope: ExportRowScope) => void
}) {
  const available = useMemo(() => defaultExportColumns(columns), [columns])
  const [picked, setPicked] = useState<string[]>(() => available)
  const [rowScope, setRowScope] = useState<ExportRowScope>(() => defaultExportRowScope(selectedRowCount))

  useEffect(() => {
    if (!open) return
    setPicked(selectAllExportColumns(columns))
    setRowScope(defaultExportRowScope(selectedRowCount))
  }, [open, columns, selectedRowCount])

  useEffect(() => {
    if (!open) return
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault()
        onCancel()
      }
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [open, onCancel])

  if (!open) return null

  const selectedCount = normalizePickedColumns(columns, picked).length
  const label = EXPORT_FORMAT_LABELS[format]
  const hasSelection = selectedRowCount > 0
  const effectiveScope: ExportRowScope = hasSelection ? rowScope : 'all'
  const exportRowCount =
    effectiveScope === 'selected' && hasSelection ? selectedRowCount : rowCount

  return (
    <div className="overlay export-column-overlay" role="presentation" onMouseDown={onCancel}>
      <div
        className="dialog dialog-wide export-column-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="export-column-title"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <h2 id="export-column-title">导出 {label} · 选择列</h2>
        <p className="dialog-copy">
          {exportRowScopeSummary(effectiveScope, rowCount, selectedRowCount)}
        </p>
        {hasSelection && (
          <div className="export-row-scope" role="radiogroup" aria-label="导出行范围">
            <button
              type="button"
              role="radio"
              aria-checked={rowScope === 'selected'}
              className={
                rowScope === 'selected'
                  ? 'btn btn-ghost tiny-btn is-active'
                  : 'btn btn-ghost tiny-btn'
              }
              onClick={() => setRowScope('selected')}
            >
              {exportRowScopeOptionLabel('selected', rowCount, selectedRowCount)}
            </button>
            <button
              type="button"
              role="radio"
              aria-checked={rowScope === 'all'}
              className={
                rowScope === 'all' ? 'btn btn-ghost tiny-btn is-active' : 'btn btn-ghost tiny-btn'
              }
              onClick={() => setRowScope('all')}
            >
              {exportRowScopeOptionLabel('all', rowCount, selectedRowCount)}
            </button>
          </div>
        )}
        <div className="export-column-toolbar">
          <button
            type="button"
            className="btn btn-ghost tiny-btn"
            onClick={() => setPicked(selectAllExportColumns(columns))}
          >
            全选
          </button>
          <button
            type="button"
            className="btn btn-ghost tiny-btn"
            onClick={() => setPicked(selectNoneExportColumns())}
          >
            全不选
          </button>
          <span className="export-column-count">
            已选 {selectedCount}/{available.length} 列 · {exportRowCount.toLocaleString('zh-CN')} 行
          </span>
        </div>
        <ul className="export-column-list" role="listbox" aria-label="导出列" aria-multiselectable="true">
          {available.map((column) => {
            const checked = picked.includes(column)
            return (
              <li key={column}>
                <label className={checked ? 'export-column-item is-on' : 'export-column-item'}>
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={(event) =>
                      setPicked((current) => togglePickedColumn(current, column, event.target.checked))
                    }
                  />
                  <span>{column}</span>
                </label>
              </li>
            )
          })}
        </ul>
        <div className="dialog-actions">
          <button type="button" className="btn btn-ghost" onClick={onCancel}>
            取消
          </button>
          <button
            type="button"
            className="btn btn-primary"
            disabled={selectedCount === 0 || exportRowCount === 0}
            onClick={() => onConfirm(normalizePickedColumns(columns, picked), effectiveScope)}
          >
            导出 {label}
          </button>
        </div>
      </div>
    </div>
  )
}
