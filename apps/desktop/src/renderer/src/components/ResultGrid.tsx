import { useEffect, useMemo, useState, type KeyboardEvent } from 'react'
import { getApi } from '../bridge'
import { rowsToCsv, rowsToJson } from '@shared/exportTable'
import { inferSqliteTable } from '@shared/sql'
import { formatCell, isNumericColumn } from '../format'
import { useWorkspace } from '../state/workspace'

function downloadText(filename: string, text: string, mime: string): void {
  const blob = new Blob([text], { type: mime })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = filename
  anchor.click()
  URL.revokeObjectURL(url)
}

export function ResultToolbar({
  columns,
  rows,
}: {
  columns: string[]
  rows: Record<string, unknown>[]
}) {
  const copyAll = async () => {
    const text = rowsToCsv(columns, rows)
    await navigator.clipboard.writeText(text)
  }

  return (
    <div className="result-tools">
      <button
        type="button"
        className="btn btn-ghost tiny-btn"
        onClick={() => downloadText(`dataai-result-${Date.now()}.csv`, rowsToCsv(columns, rows), 'text/csv;charset=utf-8')}
      >
        导出 CSV
      </button>
      <button
        type="button"
        className="btn btn-ghost tiny-btn"
        onClick={() =>
          downloadText(`dataai-result-${Date.now()}.json`, rowsToJson(columns, rows), 'application/json;charset=utf-8')
        }
      >
        导出 JSON
      </button>
      <button type="button" className="btn btn-ghost tiny-btn" onClick={() => void copyAll()}>
        复制表格
      </button>
    </div>
  )
}

export function ResultGrid({ columns, rows }: { columns: string[]; rows: Record<string, unknown>[] }) {
  const ws = useWorkspace()
  const numeric = Object.fromEntries(columns.map((column) => [column, isNumericColumn(rows, column)]))
  const [focus, setFocus] = useState({ row: 0, col: 0 })
  const [editing, setEditing] = useState<{ row: number; col: number; draft: string } | null>(null)
  const [note, setNote] = useState('')

  const visibleColumns = useMemo(() => columns.filter((column) => column !== '__rowid__'), [columns])
  const canEditSqlite = useMemo(() => {
    const dialect = ws.activeConnection?.dialect
    const sql = ws.activeEditor?.sql ?? ''
    return dialect === 'sqlite' && columns.includes('__rowid__') && Boolean(inferSqliteTable(sql))
  }, [columns, ws.activeConnection?.dialect, ws.activeEditor?.sql])

  useEffect(() => {
    setFocus({ row: 0, col: 0 })
    setEditing(null)
  }, [columns, rows])

  const move = (rowDelta: number, colDelta: number) => {
    setFocus((current) => ({
      row: Math.min(Math.max(0, current.row + rowDelta), Math.max(0, rows.length - 1)),
      col: Math.min(Math.max(0, current.col + colDelta), Math.max(0, visibleColumns.length - 1)),
    }))
  }

  const copyFocused = async () => {
    const column = visibleColumns[focus.col]
    if (!column) return
    const text = formatCell(rows[focus.row]?.[column])
    await navigator.clipboard.writeText(text === '—' ? '' : text)
    setNote('已复制单元格')
  }

  const beginEdit = (rowIndex: number, colIndex: number) => {
    if (!canEditSqlite) return
    const column = visibleColumns[colIndex]
    if (!column) return
    const raw = rows[rowIndex]?.[column]
    setEditing({ row: rowIndex, col: colIndex, draft: raw == null ? '' : String(raw) })
  }

  const commitEdit = async () => {
    if (!editing || !ws.activeConnection) return
    const column = visibleColumns[editing.col]
    const table = inferSqliteTable(ws.activeEditor?.sql ?? '')
    const rowid = Number(rows[editing.row]?.__rowid__)
    if (!column || !table || !Number.isFinite(rowid)) {
      setEditing(null)
      return
    }
    const ok = window.confirm(`确认把 ${table}.${column}（rowid=${rowid}）改成「${editing.draft || 'NULL'}」？`)
    if (!ok) {
      setEditing(null)
      return
    }
    const value =
      editing.draft.trim() === ''
        ? null
        : Number.isFinite(Number(editing.draft)) && editing.draft.trim() !== '' && /^-?\d+(\.\d+)?$/.test(editing.draft.trim())
          ? Number(editing.draft.trim())
          : editing.draft
    try {
      await getApi().sql.updateSqliteCell({
        connectionId: ws.activeConnection.id,
        table,
        rowid,
        column,
        value,
      })
      setEditing(null)
      setNote('已更新，正在刷新…')
      await ws.run()
      setNote('单元格已更新')
    } catch (error) {
      window.alert(error instanceof Error ? error.message : '更新失败')
    }
  }

  // Prefer workspace helpers if present; fallback via getApi in effects below is avoided by wiring in workspace.
  const onCopyKey = (event: KeyboardEvent) => {
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'c' && !editing) {
      event.preventDefault()
      void copyFocused()
    }
  }

  return (
    <div
      className="grid-wrap"
      tabIndex={0}
      role="grid"
      aria-label="结果表格"
      aria-rowcount={rows.length}
      aria-colcount={visibleColumns.length + 1}
      onKeyDown={(event) => {
        onCopyKey(event)
        if (editing) return
        if (event.key === 'ArrowDown') {
          event.preventDefault()
          move(1, 0)
        } else if (event.key === 'ArrowUp') {
          event.preventDefault()
          move(-1, 0)
        } else if (event.key === 'ArrowRight') {
          event.preventDefault()
          move(0, 1)
        } else if (event.key === 'ArrowLeft') {
          event.preventDefault()
          move(0, -1)
        } else if (event.key === 'Home') {
          event.preventDefault()
          setFocus((current) => ({ ...current, col: 0 }))
        } else if (event.key === 'End') {
          event.preventDefault()
          setFocus((current) => ({ ...current, col: visibleColumns.length - 1 }))
        } else if (event.key === 'Enter' && canEditSqlite) {
          event.preventDefault()
          beginEdit(focus.row, focus.col)
        } else if (event.key === 'c' && !event.ctrlKey && !event.metaKey) {
          void copyFocused()
        }
      }}
    >
      <table className="grid">
        <thead>
          <tr role="row">
            <th className="row-index" scope="col" />
            {visibleColumns.map((column) => (
              <th key={column} scope="col" role="columnheader" className={numeric[column] ? 'is-number' : undefined}>
                {column}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, rowIndex) => (
            <tr key={rowIndex} role="row" className={focus.row === rowIndex ? 'is-active' : undefined}>
              <th className="row-index" scope="row">
                {rowIndex + 1}
              </th>
              {visibleColumns.map((column, colIndex) => {
                const value = row[column]
                const text = formatCell(value)
                const focused = focus.row === rowIndex && focus.col === colIndex
                const isEditing = editing?.row === rowIndex && editing.col === colIndex
                return (
                  <td
                    key={column}
                    role="gridcell"
                    title={canEditSqlite ? `${text}（双击编辑 / Ctrl+C 复制）` : `${text}（Ctrl+C 复制）`}
                    className={[
                      numeric[column] ? 'is-number' : '',
                      value == null ? 'is-null' : '',
                      focused ? 'is-focused' : '',
                    ]
                      .filter(Boolean)
                      .join(' ')}
                    onClick={() => setFocus({ row: rowIndex, col: colIndex })}
                    onDoubleClick={() => beginEdit(rowIndex, colIndex)}
                  >
                    {isEditing ? (
                      <input
                        className="cell-editor"
                        autoFocus
                        value={editing.draft}
                        onChange={(event) => setEditing({ ...editing, draft: event.target.value })}
                        onBlur={() => void commitEdit()}
                        onKeyDown={(event) => {
                          if (event.key === 'Enter') {
                            event.preventDefault()
                            void commitEdit()
                          } else if (event.key === 'Escape') {
                            event.preventDefault()
                            setEditing(null)
                          }
                        }}
                      />
                    ) : (
                      text
                    )}
                  </td>
                )
              })}
            </tr>
          ))}
        </tbody>
      </table>
      {note && <p className="result-footnote">{note}</p>}
      {canEditSqlite && <p className="result-footnote">SQLite：双击单元格可编辑（需确认）。隐藏列 __rowid__ 用于定位行。</p>}
    </div>
  )
}
