import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react'
import { useVirtualizer } from '@tanstack/react-virtual'
import ExcelJS from 'exceljs'
import { getApi } from '../bridge'
import { capExportRows, rowsToCsv, rowsToHtml, rowsToJson, rowsToMarkdown } from '@shared/exportTable'
import {
  columnValues,
  rowsToValuesSql,
  rowTuples,
  valuesToInList,
} from '@shared/sqlCopy'
import { inferSqliteTable } from '@shared/sql'
import { formatCell, isNumericColumn } from '../format'
import { useWorkspace } from '../state/workspace'
import { nextSortState, sortResultRows, type ResultSort } from '@shared/resultSort'

const ROW_HEIGHT = 32

function downloadBlob(filename: string, blob: Blob): void {
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = filename
  anchor.click()
  URL.revokeObjectURL(url)
}

function downloadText(filename: string, text: string, mime: string): void {
  downloadBlob(filename, new Blob([text], { type: mime }))
}

async function downloadExcel(columns: string[], rows: Record<string, unknown>[]): Promise<void> {
  const book = new ExcelJS.Workbook()
  book.creator = 'DataAI'
  const sheet = book.addWorksheet('结果', { views: [{ state: 'frozen', ySplit: 1 }] })
  sheet.addRow(columns)
  sheet.getRow(1).font = { bold: true }
  for (const row of rows) {
    sheet.addRow(columns.map((column) => {
      const value = row[column]
      if (value == null) return null
      if (typeof value === 'object') return JSON.stringify(value)
      return value as string | number | boolean
    }))
  }
  columns.forEach((_, index) => {
    sheet.getColumn(index + 1).width = 16
  })
  const buffer = await book.xlsx.writeBuffer()
  downloadBlob(
    `dataai-result-${Date.now()}.xlsx`,
    new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }),
  )
}

export function ResultToolbar({
  columns,
  rows,
  focusColumn,
  filterQuery,
  onFilterQuery,
  totalRows,
}: {
  columns: string[]
  rows: Record<string, unknown>[]
  focusColumn?: string | null
  filterQuery?: string
  onFilterQuery?: (value: string) => void
  totalRows?: number
}) {
  const ws = useWorkspace()
  const [busy, setBusy] = useState(false)
  const [copyNote, setCopyNote] = useState('')
  const visible = columns.filter((column) => column !== '__rowid__')
  const exportColumns = visible.length > 0 ? visible : columns
  const statsColumn = focusColumn && visible.includes(focusColumn) ? focusColumn : visible[0] ?? null
  const allCount = totalRows ?? rows.length

  const copyAll = async () => {
    await navigator.clipboard.writeText(rowsToCsv(exportColumns, rows))
    setCopyNote('已复制 CSV')
  }

  const copyInList = async () => {
    if (!statsColumn || rows.length === 0) return
    const { sql, truncated, count } = valuesToInList(columnValues(rows, statsColumn))
    await navigator.clipboard.writeText(sql)
    setCopyNote(
      truncated
        ? `已复制 IN（${count}，已截断）· ${statsColumn}`
        : `已复制 IN（${count}）· ${statsColumn}`,
    )
  }

  const copyValuesSnippet = async () => {
    if (rows.length === 0) return
    const cols = statsColumn ? [statsColumn] : exportColumns
    const { sql, truncated, count } = rowsToValuesSql(rowTuples(rows, cols))
    await navigator.clipboard.writeText('VALUES\n' + sql)
    setCopyNote(
      truncated
        ? `已复制 VALUES（${count} 行，已截断）`
        : `已复制 VALUES（${count} 行 · ${cols.length} 列）`,
    )
  }

  const exportCapped = (kind: 'markdown' | 'html' | 'excel') => {
    const { rows: capped, truncated, total } = capExportRows(rows)
    if (truncated) {
      window.alert(
        `${kind === 'excel' ? 'Excel' : kind === 'markdown' ? 'Markdown' : 'HTML'} 导出已截断为前 ${capped.length.toLocaleString('zh-CN')} 行（共 ${total.toLocaleString('zh-CN')} 行）`,
      )
    }
    return capped
  }

  return (
    <div className="result-tools">
      {onFilterQuery && (
        <label className="result-filter">
          <span className="result-filter-label">筛选</span>
          <input
            className="result-filter-input"
            value={filterQuery ?? ''}
            onChange={(e) => onFilterQuery(e.target.value)}
            placeholder="过滤当前结果…"
            aria-label="过滤结果行"
          />
          {(filterQuery ?? '').trim() && (
            <span className="result-filter-count">
              {rows.length}/{allCount}
            </span>
          )}
        </label>
      )}
      <button
        type="button"
        className="btn btn-ghost tiny-btn"
        disabled={!statsColumn || rows.length === 0}
        title={statsColumn ? `统计列：${statsColumn}` : '无可统计列'}
        onClick={() => {
          if (!statsColumn) return
          ws.openColumnStats({ source: 'result', column: statsColumn, rows })
        }}
      >
        列统计
      </button>
      <button
        type="button"
        className="btn btn-ghost tiny-btn"
        disabled={rows.length === 0}
        onClick={() =>
          downloadText(`dataai-result-${Date.now()}.csv`, rowsToCsv(exportColumns, rows), 'text/csv;charset=utf-8')
        }
      >
        导出 CSV
      </button>
      <button
        type="button"
        className="btn btn-ghost tiny-btn"
        disabled={rows.length === 0}
        onClick={() =>
          downloadText(
            `dataai-result-${Date.now()}.json`,
            rowsToJson(exportColumns, rows),
            'application/json;charset=utf-8',
          )
        }
      >
        导出 JSON
      </button>
      <button
        type="button"
        className="btn btn-ghost tiny-btn"
        disabled={rows.length === 0}
        onClick={() => {
          const capped = exportCapped('markdown')
          downloadText(
            `dataai-result-${Date.now()}.md`,
            rowsToMarkdown(exportColumns, capped),
            'text/markdown;charset=utf-8',
          )
        }}
      >
        导出 MD
      </button>
      <button
        type="button"
        className="btn btn-ghost tiny-btn"
        disabled={rows.length === 0}
        onClick={() => {
          const capped = exportCapped('html')
          downloadText(
            `dataai-result-${Date.now()}.html`,
            rowsToHtml(exportColumns, capped),
            'text/html;charset=utf-8',
          )
        }}
      >
        导出 HTML
      </button>
      <button
        type="button"
        className="btn btn-ghost tiny-btn"
        disabled={busy || rows.length === 0}
        onClick={() => {
          setBusy(true)
          const capped = exportCapped('excel')
          void downloadExcel(exportColumns, capped)
            .catch((error: unknown) => window.alert(error instanceof Error ? error.message : '导出 Excel 失败'))
            .finally(() => setBusy(false))
        }}
      >
        {busy ? '导出中…' : '导出 Excel'}
      </button>
      <button type="button" className="btn btn-ghost tiny-btn" onClick={() => void copyAll()}>
        复制表格
      </button>
      <button
        type="button"
        className="btn btn-ghost tiny-btn"
        disabled={!statsColumn || rows.length === 0}
        title={statsColumn ? `复制列 ${statsColumn} 为 IN (...)` : '无可用列'}
        onClick={() => void copyInList()}
      >
        复制 IN
      </button>
      <button
        type="button"
        className="btn btn-ghost tiny-btn"
        disabled={rows.length === 0}
        title={
          statsColumn
            ? `复制列 ${statsColumn} 为 VALUES`
            : '复制当前结果为 VALUES'
        }
        onClick={() => void copyValuesSnippet()}
      >
        复制 VALUES
      </button>
      {copyNote && <span className="result-copy-note">{copyNote}</span>}
    </div>
  )
}

export function ResultGrid({
  columns,
  rows,
  onFocusColumn,
  onViewRowsChange,
}: {
  columns: string[]
  rows: Record<string, unknown>[]
  onFocusColumn?: (column: string | null) => void
  onViewRowsChange?: (rows: Record<string, unknown>[]) => void
}) {
  const ws = useWorkspace()
  const parentRef = useRef<HTMLDivElement>(null)
  const [focus, setFocus] = useState({ row: 0, col: 0 })
  const [editing, setEditing] = useState<{ row: number; col: number; draft: string } | null>(null)
  const [note, setNote] = useState('')
  const [sort, setSort] = useState<ResultSort | null>(null)
  const [pinned, setPinned] = useState<string[]>([])
  const [contextMenu, setContextMenu] = useState<{
    x: number
    y: number
    column: string
    rowIndex: number | null
  } | null>(null)

  const visibleColumns = useMemo(() => columns.filter((column) => column !== '__rowid__'), [columns])
  const displayColumns = useMemo(() => {
    const pinnedSet = new Set(pinned.filter((name) => visibleColumns.includes(name)))
    const head = pinned.filter((name) => pinnedSet.has(name)).slice(0, 2)
    const rest = visibleColumns.filter((name) => !head.includes(name))
    return [...head, ...rest]
  }, [visibleColumns, pinned])

  const displayRows = useMemo(() => sortResultRows(rows, sort), [rows, sort])
  useEffect(() => {
    onViewRowsChange?.(displayRows)
  }, [displayRows, onViewRowsChange])
  const numeric = Object.fromEntries(displayColumns.map((column) => [column, isNumericColumn(displayRows, column)]))

  const canEditSqlite = useMemo(() => {
    const dialect = ws.activeConnection?.dialect
    const sql = ws.activeEditor?.sql ?? ''
    return dialect === 'sqlite' && columns.includes('__rowid__') && Boolean(inferSqliteTable(sql))
  }, [columns, ws.activeConnection?.dialect, ws.activeEditor?.sql])

  const virtualizer = useVirtualizer({
    count: displayRows.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => ROW_HEIGHT,
    overscan: 16,
  })

  useEffect(() => {
    setFocus({ row: 0, col: 0 })
    setEditing(null)
    setSort(null)
    setContextMenu(null)
    setPinned((current) => current.filter((name) => columns.includes(name)))
    setNote(rows.length > 500 ? `已虚拟滚动渲染 ${rows.length.toLocaleString('zh-CN')} 行` : '')
  }, [columns, rows])

  useEffect(() => {
    if (!contextMenu) return
    const close = () => setContextMenu(null)
    window.addEventListener('mousedown', close)
    return () => window.removeEventListener('mousedown', close)
  }, [contextMenu])

  useEffect(() => {
    onFocusColumn?.(displayColumns[focus.col] ?? null)
  }, [focus.col, displayColumns, onFocusColumn])

  useEffect(() => {
    if (editing) return
    virtualizer.scrollToIndex(focus.row, { align: 'auto' })
  }, [focus.row, editing, virtualizer])

  const move = (rowDelta: number, colDelta: number) => {
    setFocus((current) => ({
      row: Math.min(Math.max(0, current.row + rowDelta), Math.max(0, displayRows.length - 1)),
      col: Math.min(Math.max(0, current.col + colDelta), Math.max(0, displayColumns.length - 1)),
    }))
  }

  const copyFocused = async () => {
    const column = displayColumns[focus.col]
    if (!column) return
    const text = formatCell(displayRows[focus.row]?.[column])
    await navigator.clipboard.writeText(text === '—' ? '' : text)
    setNote('已复制单元格')
  }

  const copyColumnAsIn = async (column: string) => {
    const { sql, truncated, count } = valuesToInList(columnValues(displayRows, column))
    await navigator.clipboard.writeText(sql)
    setNote(truncated ? `已复制 IN（${count}，已截断）` : `已复制 IN（${count}）· ${column}`)
    setContextMenu(null)
  }

  const copyColumnAsValues = async (column: string) => {
    const { sql, truncated, count } = rowsToValuesSql(rowTuples(displayRows, [column]))
    await navigator.clipboard.writeText('VALUES\n' + sql)
    setNote(truncated ? `已复制 VALUES（${count}，已截断）` : `已复制 VALUES（${count}）· ${column}`)
    setContextMenu(null)
  }

  const copyRowAsValues = async (rowIndex: number) => {
    const row = displayRows[rowIndex]
    if (!row) return
    const { sql } = rowsToValuesSql([displayColumns.map((column) => row[column] ?? null)])
    await navigator.clipboard.writeText('VALUES\n' + sql)
    setNote(`已复制当前行为 VALUES（${displayColumns.length} 列）`)
    setContextMenu(null)
  }

  const copyCellAsIn = async (rowIndex: number, column: string) => {
    const { sql } = valuesToInList([displayRows[rowIndex]?.[column] ?? null], { distinct: false })
    await navigator.clipboard.writeText(sql)
    setNote('已复制单元格为 IN')
    setContextMenu(null)
  }

  const beginEdit = (rowIndex: number, colIndex: number) => {
    if (!canEditSqlite) return
    const column = displayColumns[colIndex]
    if (!column) return
    const raw = displayRows[rowIndex]?.[column]
    setEditing({ row: rowIndex, col: colIndex, draft: raw == null ? '' : String(raw) })
  }

  const togglePin = (column: string) => {
    setPinned((current) => {
      if (current.includes(column)) return current.filter((name) => name !== column)
      if (current.length >= 2) return [...current.slice(1), column]
      return [...current, column]
    })
  }

  const pinIndex = (column: string) => {
    const idx = pinned.filter((name) => displayColumns.includes(name)).indexOf(column)
    return idx >= 0 && idx < 2 ? idx : -1
  }

  const pinLeft = (column: string) => {
    const idx = pinIndex(column)
    if (idx < 0) return undefined
    // row gutter 48px + prior pinned ~140px
    return 48 + idx * 140
  }

  const commitEdit = async () => {
    if (!editing || !ws.activeConnection) return
    const column = displayColumns[editing.col]
    const table = inferSqliteTable(ws.activeEditor?.sql ?? '')
    const rowid = Number(displayRows[editing.row]?.__rowid__)
    if (!column || !table || !Number.isFinite(rowid)) {
      setEditing(null)
      return
    }
    if (!ws.assertWritable('单元格编辑')) {
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
        : /^-?\d+(\.\d+)?$/.test(editing.draft.trim())
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

  const virtualRows = virtualizer.getVirtualItems()
  const paddingTop = virtualRows[0]?.start ?? 0
  const paddingBottom = Math.max(0, virtualizer.getTotalSize() - (virtualRows.at(-1)?.end ?? 0))

  return (
    <div
      className="grid-wrap"
      ref={parentRef}
      tabIndex={0}
      role="grid"
      aria-label="结果表格"
      aria-rowcount={displayRows.length}
      aria-colcount={displayColumns.length + 1}
      onKeyDown={(event: KeyboardEvent) => {
        if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'c' && !editing) {
          event.preventDefault()
          void copyFocused()
          return
        }
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
          setFocus((current) => ({ ...current, col: displayColumns.length - 1 }))
        } else if (event.key === 'Enter' && canEditSqlite) {
          event.preventDefault()
          beginEdit(focus.row, focus.col)
        }
      }}
    >
      <table className="grid is-virtual">
        <thead>
          <tr role="row">
            <th className="row-index" scope="col" title="行号">
              #
            </th>
            {displayColumns.map((column) => {
              const pinnedAt = pinIndex(column)
              const sortMark =
                sort?.column === column ? (sort.direction === 'asc' ? ' ▲' : ' ▼') : ''
              return (
                <th
                  key={column}
                  scope="col"
                  role="columnheader"
                  onContextMenu={(event) => {
                    event.preventDefault()
                    setContextMenu({ x: event.clientX, y: event.clientY, column, rowIndex: null })
                  }}
                  aria-sort={
                    sort?.column === column
                      ? sort.direction === 'asc'
                        ? 'ascending'
                        : 'descending'
                      : 'none'
                  }
                  className={[
                    numeric[column] ? 'is-number' : '',
                    pinnedAt >= 0 ? `is-pinned is-pinned-${pinnedAt}` : '',
                    sort?.column === column ? 'is-sorted' : '',
                  ]
                    .filter(Boolean)
                    .join(' ')}
                  style={pinnedAt >= 0 ? { left: pinLeft(column) } : undefined}
                >
                  <button
                    type="button"
                    className="grid-sort-btn"
                    onClick={() => setSort((current) => nextSortState(current, column))}
                    title="点击排序：升序 → 降序 → 取消"
                  >
                    {column}
                    {sortMark}
                  </button>
                  <button
                    type="button"
                    className={pinnedAt >= 0 ? 'grid-pin-btn is-on' : 'grid-pin-btn'}
                    title={pinnedAt >= 0 ? '取消固定列' : '固定到左侧（最多 2 列）'}
                    onClick={(event) => {
                      event.stopPropagation()
                      togglePin(column)
                    }}
                  >
                    钉
                  </button>
                </th>
              )
            })}
          </tr>
        </thead>
        <tbody>
          {paddingTop > 0 && (
            <tr aria-hidden="true" className="virtual-pad">
              <td colSpan={displayColumns.length + 1} style={{ height: paddingTop, padding: 0, border: 'none' }} />
            </tr>
          )}
          {virtualRows.map((item) => {
            const rowIndex = item.index
            const row = displayRows[rowIndex] ?? {}
            return (
              <tr
                key={item.key}
                role="row"
                data-index={rowIndex}
                className={focus.row === rowIndex ? 'is-active' : undefined}
                style={{ height: ROW_HEIGHT }}
              >
                <th className="row-index" scope="row">
                  {rowIndex + 1}
                </th>
                {displayColumns.map((column, colIndex) => {
                  const value = row[column]
                  const text = formatCell(value)
                  const focused = focus.row === rowIndex && focus.col === colIndex
                  const isEditing = editing?.row === rowIndex && editing.col === colIndex
                  const pinnedAt = pinIndex(column)
                  return (
                    <td
                      key={column}
                      role="gridcell"
                      onContextMenu={(event) => {
                        event.preventDefault()
                        setFocus({ row: rowIndex, col: colIndex })
                        setContextMenu({
                          x: event.clientX,
                          y: event.clientY,
                          column,
                          rowIndex,
                        })
                      }}
                      title={canEditSqlite ? `${text}（双击编辑 / Ctrl+C 复制）` : `${text}（Ctrl+C 复制）`}
                      className={[
                        numeric[column] ? 'is-number' : '',
                        value == null ? 'is-null' : '',
                        focused ? 'is-focused' : '',
                        pinnedAt >= 0 ? `is-pinned is-pinned-${pinnedAt}` : '',
                      ]
                        .filter(Boolean)
                        .join(' ')}
                      style={pinnedAt >= 0 ? { left: pinLeft(column) } : undefined}
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
            )
          })}
          {paddingBottom > 0 && (
            <tr aria-hidden="true" className="virtual-pad">
              <td colSpan={displayColumns.length + 1} style={{ height: paddingBottom, padding: 0, border: 'none' }} />
            </tr>
          )}
        </tbody>
      </table>
      {contextMenu && (
        <div
          className="grid-context-menu"
          style={{ left: contextMenu.x, top: contextMenu.y }}
          role="menu"
          onMouseDown={(event) => event.stopPropagation()}
        >
          <button type="button" role="menuitem" onClick={() => void copyColumnAsIn(contextMenu.column)}>
            复制列 IN (...)
          </button>
          <button type="button" role="menuitem" onClick={() => void copyColumnAsValues(contextMenu.column)}>
            复制列 VALUES
          </button>
          {contextMenu.rowIndex != null && (
            <>
              <button
                type="button"
                role="menuitem"
                onClick={() => void copyCellAsIn(contextMenu.rowIndex!, contextMenu.column)}
              >
                复制单元格 IN
              </button>
              <button
                type="button"
                role="menuitem"
                onClick={() => void copyRowAsValues(contextMenu.rowIndex!)}
              >
                复制行 VALUES
              </button>
            </>
          )}
        </div>
      )}
      {note && <p className="result-footnote">{note}</p>}
      <p className="result-footnote">
        表头点击排序；右键可复制 IN / VALUES；「钉」固定最多 2 列；左侧 # 为行号。
        {sort ? ` 当前排序：${sort.column} ${sort.direction === 'asc' ? '升序' : '降序'}。` : ''}
      </p>
      {canEditSqlite && <p className="result-footnote">SQLite：双击单元格可编辑（需确认）。隐藏列 __rowid__ 用于定位行。</p>}
    </div>
  )
}
