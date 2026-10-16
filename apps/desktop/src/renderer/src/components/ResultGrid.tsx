import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react'
import { useVirtualizer } from '@tanstack/react-virtual'
import ExcelJS from 'exceljs'
import { getApi } from '../bridge'
import {
  capExportRows,
  rowsToCsv,
  rowsToHtml,
  rowsToJson,
  rowsToMarkdown,
  rowsToTsv,
} from '@shared/exportTable'
import {
  buildResultMarkdownClipboard,
  resultMarkdownCopiedToast,
} from '@shared/resultMarkdownCopy'
import {
  buildResultJsonClipboard,
  resultJsonCopiedToast,
} from '@shared/resultJsonCopy'
import { cellCopyClickHint, cellValueCopiedNote } from '@shared/cellCopy'
import {
  columnValues,
  insertCopiedToast,
  rowsToInsertSql,
  rowsToValuesSql,
  rowTuples,
  suggestInsertTableName,
  valuesToInList,
} from '@shared/sqlCopy'
import { inferSqliteTable } from '@shared/sql'
import { formatCell, isNumericColumn } from '../format'
import { cellClipboardText, cellDisplayHint, cellDisplayKind } from '@shared/cellDisplay'
import {
  columnHeadersCopiedToast,
  formatColumnHeaders,
  visibleResultColumns as headerNameColumns,
} from '@shared/resultColumnHeaders'
import { useWorkspace } from '../state/workspace'
import { nextSortState, sortResultRows, type ResultSort } from '@shared/resultSort'
import {
  rangeRowIndexes,
  selectAllRowIndexes,
  selectedRowsFromIndexes,
  toggleRowIndex,
} from '@shared/rowSelection'
import { collectResultFindHits, stepFindIndex } from '@shared/resultFind'
import { estimateAllColumnWidths, estimateColumnWidthPx } from '@shared/resultColumnAutofit'
import {
  applyColumnFilters,
  COLUMN_FILTER_MODE_LABELS,
  countActiveColumnFilters,
  isColumnFilterActive,
  setColumnFilter,
  type ColumnFilter,
  type ColumnFilterMode,
  type ColumnFilters,
} from '@shared/resultColumnFilter'
import { emitDataai, onDataai } from '../appEvents'
import { ExportColumnDialog } from './ExportColumnDialog'
import { CellValuePreviewDialog } from './CellValuePreviewDialog'
import { type ExportFormat } from '@shared/exportColumnPick'
import {
  baseResultColumns,
  canHideColumn,
  countHiddenColumns,
  resetHiddenColumns,
  setColumnHidden,
  visibleResultColumns,
} from '@shared/resultColumnVisibility'

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
  selectedRows,
  focusColumn,
  filterQuery,
  onFilterQuery,
  totalRows,
  insertTableName,
}: {
  columns: string[]
  rows: Record<string, unknown>[]
  /** When non-empty, copy / IN / VALUES / INSERT use this subset. */
  selectedRows?: Record<string, unknown>[]
  focusColumn?: string | null
  filterQuery?: string
  onFilterQuery?: (value: string) => void
  totalRows?: number
  /** Preferred table name for INSERT copy (e.g. browse target). */
  insertTableName?: string | null
}) {
  const ws = useWorkspace()
  const [busy, setBusy] = useState(false)
  const [copyNote, setCopyNote] = useState('')
  const [exportDialog, setExportDialog] = useState<ExportFormat | null>(null)
  const visible = columns.filter((column) => column !== '__rowid__')
  const exportColumns = visible.length > 0 ? visible : columns
  const statsColumn = focusColumn && visible.includes(focusColumn) ? focusColumn : visible[0] ?? null
  const allCount = totalRows ?? rows.length
  const selectionActive = (selectedRows?.length ?? 0) > 0
  const copySource = selectionActive ? selectedRows! : rows
  const selectionLabel = selectionActive ? `已选 ${copySource.length}` : ''

  const copyAll = async () => {
    await navigator.clipboard.writeText(rowsToCsv(exportColumns, copySource))
    setCopyNote(
      selectionActive
        ? `已复制 CSV（${copySource.length} 行 · UTF-8 BOM）`
        : '已复制 CSV（UTF-8 BOM，Excel 可直接打开）',
    )
  }

  const copyTsv = async () => {
    if (copySource.length === 0) return
    await navigator.clipboard.writeText(rowsToTsv(exportColumns, copySource))
    setCopyNote(
      selectionActive ? `已复制 TSV（${copySource.length} 行）` : `已复制 TSV（${copySource.length} 行）`,
    )
  }

  const copyMarkdown = async () => {
    if (copySource.length === 0 || exportColumns.length === 0) return
    const { text, rowCount, truncated } = buildResultMarkdownClipboard(exportColumns, copySource)
    if (!text.trim()) return
    await navigator.clipboard.writeText(text)
    setCopyNote(
      selectionActive
        ? `${resultMarkdownCopiedToast(rowCount, truncated)} · 选中行`
        : resultMarkdownCopiedToast(rowCount, truncated),
    )
  }
  const copyJson = async () => {
    if (copySource.length === 0 || exportColumns.length === 0) return
    const { text, rowCount, truncated } = buildResultJsonClipboard(exportColumns, copySource)
    if (!text.trim()) return
    await navigator.clipboard.writeText(text)
    setCopyNote(
      selectionActive
        ? `${resultJsonCopiedToast(rowCount, truncated)} · 选中行`
        : resultJsonCopiedToast(rowCount, truncated),
    )
  }


  const copyInList = async () => {
    if (!statsColumn || copySource.length === 0) return
    const { sql, truncated, count } = valuesToInList(columnValues(copySource, statsColumn))
    await navigator.clipboard.writeText(sql)
    setCopyNote(
      truncated
        ? `已复制 IN（${count}，已截断）· ${statsColumn}${selectionActive ? ' · 选中行' : ''}`
        : `已复制 IN（${count}）· ${statsColumn}${selectionActive ? ' · 选中行' : ''}`,
    )
  }

  const copyValuesSnippet = async () => {
    if (copySource.length === 0) return
    const cols = statsColumn ? [statsColumn] : exportColumns
    const { sql, truncated, count } = rowsToValuesSql(rowTuples(copySource, cols))
    await navigator.clipboard.writeText('VALUES\n' + sql)
    setCopyNote(
      truncated
        ? `已复制 VALUES（${count} 行，已截断）${selectionActive ? ' · 选中行' : ''}`
        : `已复制 VALUES（${count} 行 · ${cols.length} 列）${selectionActive ? ' · 选中行' : ''}`,
    )
  }



  const copyInsertSnippet = async () => {
    if (copySource.length === 0 || exportColumns.length === 0) return
    const table = suggestInsertTableName(insertTableName)
    const { sql, truncated, count, tableName } = rowsToInsertSql(
      table,
      exportColumns,
      rowTuples(copySource, exportColumns),
    )
    await navigator.clipboard.writeText(sql)
    setCopyNote(
      selectionActive
        ? `${insertCopiedToast(count, truncated, tableName)} · 选中行`
        : insertCopiedToast(count, truncated, tableName),
    )
  }

  const headerColumns = headerNameColumns(exportColumns)

  const copyHeaders = async () => {
    if (headerColumns.length === 0) return
    await navigator.clipboard.writeText(formatColumnHeaders(headerColumns, 'tsv'))
    setCopyNote(columnHeadersCopiedToast(headerColumns.length))
  }

  useEffect(() => {
    return onDataai('dataai:result-copy-headers', () => {
      void (async () => {
        const cols = headerNameColumns(exportColumns)
        if (cols.length === 0) return
        await navigator.clipboard.writeText(formatColumnHeaders(cols, 'tsv'))
        setCopyNote(columnHeadersCopiedToast(cols.length))
      })()
    })
  }, [exportColumns])

  useEffect(() => {
    return onDataai('dataai:result-copy-markdown', () => {
      void copyMarkdown()
    })
  }, [exportColumns, copySource, selectionActive])

  useEffect(() => {
    return onDataai('dataai:result-copy-json', () => {
      void copyJson()
    })
  }, [exportColumns, copySource, selectionActive])

  useEffect(() => {
    return onDataai('dataai:result-copy-insert', () => {
      void copyInsertSnippet()
    })
  }, [exportColumns, copySource, selectionActive, insertTableName])

  const exportCapped = (kind: 'markdown' | 'html' | 'excel', sourceRows: Record<string, unknown>[]) => {
    const { rows: capped, truncated, total } = capExportRows(sourceRows)
    if (truncated) {
      window.alert(
        `${kind === 'excel' ? 'Excel' : kind === 'markdown' ? 'Markdown' : 'HTML'} 导出已截断为前 ${capped.length.toLocaleString('zh-CN')} 行（共 ${total.toLocaleString('zh-CN')} 行）`,
      )
    }
    return capped
  }

  const runExportWithColumns = (format: ExportFormat, pickedColumns: string[]) => {
    if (pickedColumns.length === 0) return
    setExportDialog(null)
    if (format === 'csv') {
      downloadText(`dataai-result-${Date.now()}.csv`, rowsToCsv(pickedColumns, rows), 'text/csv;charset=utf-8')
      return
    }
    if (format === 'json') {
      downloadText(
        `dataai-result-${Date.now()}.json`,
        rowsToJson(pickedColumns, rows),
        'application/json;charset=utf-8',
      )
      return
    }
    if (format === 'markdown') {
      const capped = exportCapped('markdown', rows)
      downloadText(
        `dataai-result-${Date.now()}.md`,
        rowsToMarkdown(pickedColumns, capped),
        'text/markdown;charset=utf-8',
      )
      return
    }
    if (format === 'html') {
      const capped = exportCapped('html', rows)
      downloadText(
        `dataai-result-${Date.now()}.html`,
        rowsToHtml(pickedColumns, capped),
        'text/html;charset=utf-8',
      )
      return
    }
    setBusy(true)
    const capped = exportCapped('excel', rows)
    void downloadExcel(pickedColumns, capped)
      .catch((error: unknown) => window.alert(error instanceof Error ? error.message : '导出 Excel 失败'))
      .finally(() => setBusy(false))
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
        disabled={rows.length === 0}
        title="在结果中查找（结果区 Ctrl+F）"
        onClick={() => emitDataai('dataai:result-find')}
      >
        查找
      </button>
      <button
        type="button"
        className="btn btn-ghost tiny-btn"
        disabled={rows.length === 0}
        title="按表头与采样行估算列宽（命令面板「列宽适应」）"
        onClick={() => emitDataai('dataai:result-autofit-columns')}
      >
        列宽适应
      </button>
      <button
        type="button"
        className="btn btn-ghost tiny-btn"
        disabled={rows.length === 0}
        title="显示 / 隐藏结果列"
        onClick={() => emitDataai('dataai:result-column-visibility')}
      >
        显示列
      </button>
      <button
        type="button"
        className="btn btn-ghost tiny-btn"
        disabled={rows.length === 0}
        title="查看当前焦点单元格全文（只读）"
        onClick={() => emitDataai('dataai:result-cell-preview')}
      >
        查看单元格
      </button>
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
        title="选择列后导出 CSV（UTF-8 带 BOM，Excel 中文不乱码）"
        onClick={() => setExportDialog('csv')}
      >
        导出 CSV
      </button>
      <button
        type="button"
        className="btn btn-ghost tiny-btn"
        disabled={rows.length === 0}
        title="选择列后导出 JSON（当前筛选结果）"
        onClick={() => setExportDialog('json')}
      >
        导出 JSON
      </button>
      <button
        type="button"
        className="btn btn-ghost tiny-btn"
        disabled={rows.length === 0}
        title="选择列后导出 Markdown（当前筛选结果）"
        onClick={() => setExportDialog('markdown')}
      >
        导出 MD
      </button>
      <button
        type="button"
        className="btn btn-ghost tiny-btn"
        disabled={rows.length === 0}
        title="选择列后导出 HTML（当前筛选结果）"
        onClick={() => setExportDialog('html')}
      >
        导出 HTML
      </button>
      <button
        type="button"
        className="btn btn-ghost tiny-btn"
        disabled={busy || rows.length === 0}
        title="选择列后导出 Excel（当前筛选结果）"
        onClick={() => setExportDialog('excel')}
      >
        {busy ? '导出中…' : '导出 Excel'}
      </button>
      {selectionActive && (
        <span className="result-copy-note" title="复制操作作用于选中行">
          {selectionLabel}
        </span>
      )}
      <button
        type="button"
        className="btn btn-ghost tiny-btn"
        disabled={headerColumns.length === 0}
        title="复制列名（制表符分隔，可粘贴到 Excel）"
        onClick={() => void copyHeaders()}
      >
        复制列名
      </button>
      <button
        type="button"
        className="btn btn-ghost tiny-btn"
        disabled={copySource.length === 0}
        title="复制 CSV（含 UTF-8 BOM，粘贴到 Excel 不乱码）"
        onClick={() => void copyAll()}
      >
        复制 CSV
      </button>
      <button
        type="button"
        className="btn btn-ghost tiny-btn"
        disabled={copySource.length === 0}
        title="复制为制表符分隔（TSV）"
        onClick={() => void copyTsv()}
      >
        复制 TSV
      </button>
      <button
        type="button"
        className="btn btn-ghost tiny-btn"
        disabled={copySource.length === 0 || exportColumns.length === 0}
        title="复制为 GitHub Markdown 表格（可粘贴到文档 / 聊天；过多行会截断）"
        onClick={() => void copyMarkdown()}
      >
        复制 MD
      </button>
      <button
        type="button"
        className="btn btn-ghost tiny-btn"
        disabled={copySource.length === 0 || exportColumns.length === 0}
        title="复制为 JSON 数组（缩进格式；过多行会截断）"
        onClick={() => void copyJson()}
      >
        复制 JSON
      </button>
      <button
        type="button"
        className="btn btn-ghost tiny-btn"
        disabled={!statsColumn || copySource.length === 0}
        title={statsColumn ? `复制列 ${statsColumn} 为 IN (...)` : '无可用列'}
        onClick={() => void copyInList()}
      >
        复制 IN
      </button>
      <button
        type="button"
        className="btn btn-ghost tiny-btn"
        disabled={copySource.length === 0}
        title={
          statsColumn
            ? `复制列 ${statsColumn} 为 VALUES`
            : '复制当前结果为 VALUES'
        }
        onClick={() => void copyValuesSnippet()}
      >
        复制 VALUES
      </button>
      <button
        type="button"
        className="btn btn-ghost tiny-btn"
        disabled={copySource.length === 0 || exportColumns.length === 0}
        title={`复制为 INSERT INTO ${suggestInsertTableName(insertTableName)} (…) VALUES …（浏览表名优先；过多行截断）`}
        onClick={() => void copyInsertSnippet()}
      >
        复制 INSERT
      </button>
      {copyNote && <span className="result-copy-note">{copyNote}</span>}

      <ExportColumnDialog
        open={exportDialog != null}
        format={exportDialog ?? 'csv'}
        columns={exportColumns}
        rowCount={rows.length}
        onCancel={() => setExportDialog(null)}
        onConfirm={(picked) => {
          if (exportDialog) runExportWithColumns(exportDialog, picked)
        }}
      />
    </div>
  )
}

export function ResultGrid({
  columns,
  rows,
  onFocusColumn,
  onViewRowsChange,
  onSelectedRowsChange,
  onVisibleColumnsChange,
}: {
  columns: string[]
  rows: Record<string, unknown>[]
  onFocusColumn?: (column: string | null) => void
  onViewRowsChange?: (rows: Record<string, unknown>[]) => void
  onSelectedRowsChange?: (rows: Record<string, unknown>[]) => void
  /** Currently shown columns (excludes hidden + __rowid__), for export/copy defaults. */
  onVisibleColumnsChange?: (columns: string[]) => void
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
  const [selectedIndexes, setSelectedIndexes] = useState<Set<number>>(() => new Set())
  const selectionAnchorRef = useRef<number | null>(null)
  const findInputRef = useRef<HTMLInputElement>(null)
  const [findOpen, setFindOpen] = useState(false)
  const [findQuery, setFindQuery] = useState('')
  const [findCaseSensitive, setFindCaseSensitive] = useState(false)
  const [findIndex, setFindIndex] = useState(0)
  /** One-shot autofit widths; null = CSS defaults. */
  const [colWidths, setColWidths] = useState<Record<string, number> | null>(null)
  const [columnFilters, setColumnFilters] = useState<ColumnFilters>({})
  const [filterMenuColumn, setFilterMenuColumn] = useState<string | null>(null)
  const [filterDraft, setFilterDraft] = useState<ColumnFilter>({ mode: 'contains', value: '' })
  const filterMenuRef = useRef<HTMLDivElement>(null)
  const [hiddenColumns, setHiddenColumns] = useState<string[]>([])
  const [visibilityOpen, setVisibilityOpen] = useState(false)
  const visibilityRef = useRef<HTMLDivElement>(null)
  const [cellPreview, setCellPreview] = useState<{ column: string; rowIndex: number; value: unknown } | null>(null)

  const allBaseColumns = useMemo(() => baseResultColumns(columns), [columns])
  const visibleColumns = useMemo(
    () => visibleResultColumns(columns, hiddenColumns),
    [columns, hiddenColumns],
  )
  const hiddenCount = useMemo(
    () => countHiddenColumns(columns, hiddenColumns),
    [columns, hiddenColumns],
  )
  const displayColumns = useMemo(() => {
    const pinnedSet = new Set(pinned.filter((name) => visibleColumns.includes(name)))
    const head = pinned.filter((name) => pinnedSet.has(name)).slice(0, 2)
    const rest = visibleColumns.filter((name) => !head.includes(name))
    return [...head, ...rest]
  }, [visibleColumns, pinned])

  const columnFilteredRows = useMemo(
    () => applyColumnFilters(rows, columnFilters),
    [rows, columnFilters],
  )
  const displayRows = useMemo(
    () => sortResultRows(columnFilteredRows, sort),
    [columnFilteredRows, sort],
  )
  const activeColumnFilterCount = useMemo(
    () => countActiveColumnFilters(columnFilters),
    [columnFilters],
  )
  const findHits = useMemo(
    () =>
      collectResultFindHits(displayRows, displayColumns, findQuery, {
        caseSensitive: findCaseSensitive,
      }),
    [displayRows, displayColumns, findQuery, findCaseSensitive],
  )
  const findCurrent =
    findHits.length > 0 ? findHits[Math.min(Math.max(0, findIndex), findHits.length - 1)]! : null

  useEffect(() => {
    onViewRowsChange?.(displayRows)
  }, [displayRows, onViewRowsChange])

  useEffect(() => {
    onVisibleColumnsChange?.(visibleColumns)
  }, [visibleColumns, onVisibleColumnsChange])

  useEffect(() => {
    setFocus((current) => {
      const maxCol = Math.max(0, displayColumns.length - 1)
      if (current.col <= maxCol) return current
      return { ...current, col: maxCol }
    })
  }, [displayColumns.length])

  useEffect(() => {
    onSelectedRowsChange?.(selectedRowsFromIndexes(displayRows, selectedIndexes))
  }, [displayRows, selectedIndexes, onSelectedRowsChange])

  // Drop stale indexes after sort/filter size changes
  useEffect(() => {
    setSelectedIndexes((current) => {
      if (current.size === 0) return current
      const next = new Set<number>()
      for (const index of current) {
        if (index >= 0 && index < displayRows.length) next.add(index)
      }
      return next.size === current.size ? current : next
    })
  }, [displayRows.length])
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
    setSelectedIndexes(new Set())
    selectionAnchorRef.current = null
    setPinned((current) => current.filter((name) => columns.includes(name)))
    setFindOpen(false)
    setFindQuery('')
    setFindIndex(0)
    setColWidths(null)
    setColumnFilters({})
    setFilterMenuColumn(null)
    setHiddenColumns([])
    setVisibilityOpen(false)
    setCellPreview(null)
    setNote(rows.length > 500 ? `已虚拟滚动渲染 ${rows.length.toLocaleString('zh-CN')} 行` : '')
  }, [columns, rows])

  useEffect(() => {
    if (!contextMenu) return
    const close = () => setContextMenu(null)
    window.addEventListener('mousedown', close)
    return () => window.removeEventListener('mousedown', close)
  }, [contextMenu])

  useEffect(() => {
    if (!filterMenuColumn) return
    const onDown = (event: MouseEvent) => {
      const target = event.target as Node | null
      if (filterMenuRef.current?.contains(target)) return
      if (target instanceof Element && target.closest('.grid-col-filter-btn')) return
      setFilterMenuColumn(null)
    }
    window.addEventListener('mousedown', onDown)
    return () => window.removeEventListener('mousedown', onDown)
  }, [filterMenuColumn])

  useEffect(() => {
    if (!visibilityOpen) return
    const onDown = (event: MouseEvent) => {
      const target = event.target as Node | null
      if (visibilityRef.current?.contains(target)) return
      setVisibilityOpen(false)
    setCellPreview(null)
    }
    window.addEventListener('mousedown', onDown)
    return () => window.removeEventListener('mousedown', onDown)
  }, [visibilityOpen])



  useEffect(() => {
    return onDataai('dataai:result-find', () => {
      setFindOpen(true)
      queueMicrotask(() => findInputRef.current?.focus())
    })
  }, [])

  useEffect(() => {
    setFindIndex(0)
  }, [findQuery, findCaseSensitive, displayRows, displayColumns])

  useEffect(() => {
    if (!findOpen || !findQuery.trim() || !findCurrent) return
    setFocus({ row: findCurrent.row, col: findCurrent.col })
    virtualizer.scrollToIndex(findCurrent.row, { align: 'center' })
  }, [findOpen, findQuery, findCurrent?.row, findCurrent?.col, findIndex, virtualizer])

  const closeFind = () => {
    setFindOpen(false)
    setFindQuery('')
    setFindIndex(0)
  }

  const goFind = (delta: number) => {
    if (findHits.length === 0) return
    setFindIndex((current) => stepFindIndex(current, delta, findHits.length))
  }

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

  const selectRow = (rowIndex: number, event: { shiftKey?: boolean; ctrlKey?: boolean; metaKey?: boolean }) => {
    const ctrl = Boolean(event.ctrlKey || event.metaKey)
    const shift = Boolean(event.shiftKey)
    if (shift && selectionAnchorRef.current != null) {
      setSelectedIndexes(rangeRowIndexes(selectionAnchorRef.current, rowIndex))
    } else if (ctrl) {
      setSelectedIndexes((current) => toggleRowIndex(current, rowIndex))
      selectionAnchorRef.current = rowIndex
    } else {
      setSelectedIndexes(new Set([rowIndex]))
      selectionAnchorRef.current = rowIndex
    }
    setFocus((current) => ({ ...current, row: rowIndex }))
  }

  const copySelectedAsTsv = async () => {
    const selected = selectedRowsFromIndexes(displayRows, selectedIndexes)
    if (selected.length === 0) return
    await navigator.clipboard.writeText(rowsToTsv(displayColumns, selected))
    setNote(`已复制选中 ${selected.length} 行为 TSV`)
    setContextMenu(null)
  }

  const copySelectedAsCsv = async () => {
    const selected = selectedRowsFromIndexes(displayRows, selectedIndexes)
    if (selected.length === 0) return
    await navigator.clipboard.writeText(rowsToCsv(displayColumns, selected))
    setNote(`已复制选中 ${selected.length} 行为 CSV（UTF-8 BOM）`)
    setContextMenu(null)
  }

  const copySelectedAsIn = async (column: string) => {
    const selected = selectedRowsFromIndexes(displayRows, selectedIndexes)
    if (selected.length === 0) return
    const { sql, truncated, count } = valuesToInList(columnValues(selected, column))
    await navigator.clipboard.writeText(sql)
    setNote(truncated ? `已复制选中行 IN（${count}，已截断）` : `已复制选中行 IN（${count}）· ${column}`)
    setContextMenu(null)
  }

  const copySelectedAsValues = async () => {
    const selected = selectedRowsFromIndexes(displayRows, selectedIndexes)
    if (selected.length === 0) return
    const { sql, truncated, count } = rowsToValuesSql(rowTuples(selected, displayColumns))
    await navigator.clipboard.writeText('VALUES\n' + sql)
    setNote(
      truncated
        ? `已复制选中行 VALUES（${count}，已截断）`
        : `已复制选中行 VALUES（${count} 行）`,
    )
    setContextMenu(null)
  }

  const copyFocused = async () => {
    const column = displayColumns[focus.col]
    if (!column) return
    const raw = displayRows[focus.row]?.[column]
    await navigator.clipboard.writeText(cellClipboardText(raw))
    setNote(cellValueCopiedNote())
  }

  const copyCellAt = async (rowIndex: number, colIndex: number) => {
    const column = displayColumns[colIndex]
    if (!column) return
    const raw = displayRows[rowIndex]?.[column]
    await navigator.clipboard.writeText(cellClipboardText(raw))
    setFocus({ row: rowIndex, col: colIndex })
    setNote(cellValueCopiedNote())
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


  const openCellPreview = (rowIndex: number, colIndex: number) => {
    const column = displayColumns[colIndex]
    if (!column) return
    const value = displayRows[rowIndex]?.[column]
    setFocus({ row: rowIndex, col: colIndex })
    setEditing(null)
    setContextMenu(null)
    setCellPreview({ column, rowIndex, value })
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
    let left = 48
    const pinnedCols = pinned.filter((name) => displayColumns.includes(name)).slice(0, 2)
    for (let i = 0; i < idx; i += 1) {
      const name = pinnedCols[i]
      if (!name) continue
      left += colWidths?.[name] ?? 140
    }
    return left
  }

  const columnBoxStyle = (column: string, pinnedAt: number) => {
    const width = colWidths?.[column]
    const left = pinnedAt >= 0 ? pinLeft(column) : undefined
    if (width == null && left == null) return undefined
    return {
      ...(width != null ? { width, minWidth: width, maxWidth: width } : {}),
      ...(left != null ? { left } : {}),
    }
  }

  const autofitAllColumns = () => {
    if (displayColumns.length === 0) return
    const widths = estimateAllColumnWidths(displayColumns, displayRows)
    setColWidths(widths)
    setNote(`已适应 ${displayColumns.length} 列宽（采样 ${Math.min(displayRows.length, 200)} 行）`)
    setContextMenu(null)
  }

  const autofitOneColumn = (column: string) => {
    if (!displayColumns.includes(column)) return
    const width = estimateColumnWidthPx(column, displayRows)
    setColWidths((current) => ({ ...(current ?? {}), [column]: width }))
    setNote(`已适应列「${column}」→ ${width}px`)
    setContextMenu(null)
  }


  const openColumnFilter = (column: string) => {
    const existing = columnFilters[column]
    setFilterDraft(
      existing
        ? { mode: existing.mode, value: existing.value }
        : { mode: 'contains', value: '' },
    )
    setFilterMenuColumn((current) => (current === column ? null : column))
    setContextMenu(null)
  }

  const applyColumnFilterDraft = () => {
    if (!filterMenuColumn) return
    setColumnFilters((current) => setColumnFilter(current, filterMenuColumn, filterDraft))
    setFilterMenuColumn(null)
  }

  const clearOneColumnFilter = (column: string) => {
    setColumnFilters((current) => setColumnFilter(current, column, null))
    if (filterMenuColumn === column) setFilterMenuColumn(null)
  }

  const clearAllColumnFilters = () => {
    setColumnFilters({})
    setFilterMenuColumn(null)
    setNote('已清除全部列筛选')
  }


  const toggleColumnVisibility = (column: string, show: boolean) => {
    if (!show && !canHideColumn(columns, hiddenColumns, column)) {
      setNote('至少保留一列可见')
      return
    }
    setHiddenColumns((current) => setColumnHidden(columns, current, column, !show))
    if (!show) {
      setPinned((pins) => pins.filter((name) => name !== column))
    }
  }

  const restoreAllColumns = () => {
    setHiddenColumns(resetHiddenColumns())
    setVisibilityOpen(false)
    setCellPreview(null)
    setNote('已恢复全部列')
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
    <div className="result-grid-root">
      {findOpen && (
        <div className="result-find-bar" role="search" onMouseDown={(event) => event.stopPropagation()}>
          <span className="result-find-label">在结果中查找</span>
          <input
            ref={findInputRef}
            className="result-find-input"
            value={findQuery}
            placeholder="匹配单元格…"
            aria-label="在结果中查找"
            onChange={(event) => setFindQuery(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Escape') {
                event.preventDefault()
                closeFind()
                parentRef.current?.focus()
              } else if (event.key === 'Enter') {
                event.preventDefault()
                goFind(event.shiftKey ? -1 : 1)
              }
            }}
          />
          <button
            type="button"
            className={findCaseSensitive ? 'btn btn-ghost tiny-btn is-active' : 'btn btn-ghost tiny-btn'}
            aria-pressed={findCaseSensitive}
            title="区分大小写"
            onClick={() => setFindCaseSensitive((value) => !value)}
          >
            Aa
          </button>
          <span className="result-find-count" aria-live="polite">
            {findQuery.trim()
              ? findHits.length === 0
                ? '无匹配'
                : `${Math.min(findIndex, findHits.length - 1) + 1}/${findHits.length}`
              : '—'}
          </span>
          <button
            type="button"
            className="btn btn-ghost tiny-btn"
            disabled={findHits.length === 0}
            title="上一个（Shift+Enter）"
            onClick={() => goFind(-1)}
          >
            ↑
          </button>
          <button
            type="button"
            className="btn btn-ghost tiny-btn"
            disabled={findHits.length === 0}
            title="下一个（Enter）"
            onClick={() => goFind(1)}
          >
            ↓
          </button>
          <button type="button" className="btn btn-ghost tiny-btn" title="关闭（Esc）" onClick={closeFind}>
            ×
          </button>
        </div>
      )}
      {visibilityOpen && (
        <div
          ref={visibilityRef}
          className="result-col-visibility-pop"
          role="dialog"
          aria-label="显示列"
          onMouseDown={(event) => event.stopPropagation()}
        >
          <div className="result-col-visibility-title">显示列</div>
          <p className="result-col-visibility-hint">至少保留一列；隐藏列不出现在表格与默认导出中。</p>
          <ul className="result-col-visibility-list">
            {allBaseColumns.map((column) => {
              const shown = visibleColumns.includes(column)
              const disableHide = shown && !canHideColumn(columns, hiddenColumns, column)
              return (
                <li key={column}>
                  <label className={shown ? 'result-col-visibility-item is-on' : 'result-col-visibility-item'}>
                    <input
                      type="checkbox"
                      checked={shown}
                      disabled={disableHide}
                      onChange={(event) => toggleColumnVisibility(column, event.target.checked)}
                    />
                    <span>{column}</span>
                  </label>
                </li>
              )
            })}
          </ul>
          <div className="result-col-visibility-actions">
            <button
              type="button"
              className="btn btn-ghost tiny-btn"
              disabled={hiddenCount === 0}
              onClick={restoreAllColumns}
            >
              恢复全部列
            </button>
            <button type="button" className="btn btn-primary tiny-btn" onClick={() => setVisibilityOpen(false)}>
              完成
            </button>
          </div>
        </div>
      )}
      {hiddenCount > 0 && !visibilityOpen && (
        <div className="result-col-visibility-bar" role="status">
          <span>已隐藏 {hiddenCount} 列</span>
          <button type="button" className="btn btn-ghost tiny-btn" onClick={() => setVisibilityOpen(true)}>
            显示列
          </button>
          <button type="button" className="btn btn-ghost tiny-btn" onClick={restoreAllColumns}>
            恢复全部列
          </button>
        </div>
      )}

      {activeColumnFilterCount > 0 && (
        <div className="result-col-filter-bar" role="status">
          <span>
            列筛选 {activeColumnFilterCount} 项 · 显示 {displayRows.length.toLocaleString('zh-CN')} /{' '}
            {rows.length.toLocaleString('zh-CN')} 行
          </span>
          <button
            type="button"
            className="btn btn-ghost tiny-btn"
            title="清除全部列筛选（不影响上方「筛选」框）"
            onClick={clearAllColumnFilters}
          >
            清除列筛选
          </button>
        </div>
      )}
      {filterMenuColumn && (
        <div
          ref={filterMenuRef}
          className="grid-col-filter-pop"
          role="dialog"
          aria-label={`列筛选：${filterMenuColumn}`}
          onMouseDown={(event) => event.stopPropagation()}
        >
          <div className="grid-col-filter-pop-title">筛选 · {filterMenuColumn}</div>
          <label className="grid-col-filter-field">
            <span>条件</span>
            <select
              value={filterDraft.mode}
              onChange={(event) =>
                setFilterDraft((current) => ({
                  ...current,
                  mode: event.target.value as ColumnFilterMode,
                }))
              }
              aria-label="筛选条件"
            >
              {(Object.keys(COLUMN_FILTER_MODE_LABELS) as ColumnFilterMode[]).map((mode) => (
                <option key={mode} value={mode}>
                  {COLUMN_FILTER_MODE_LABELS[mode]}
                </option>
              ))}
            </select>
          </label>
          {(filterDraft.mode === 'contains' || filterDraft.mode === 'equals') && (
            <label className="grid-col-filter-field">
              <span>值</span>
              <input
                className="grid-col-filter-input"
                value={filterDraft.value}
                placeholder={filterDraft.mode === 'equals' ? '完全匹配…' : '包含…'}
                aria-label="筛选值"
                autoFocus
                onChange={(event) =>
                  setFilterDraft((current) => ({ ...current, value: event.target.value }))
                }
                onKeyDown={(event) => {
                  if (event.key === 'Enter') {
                    event.preventDefault()
                    applyColumnFilterDraft()
                  } else if (event.key === 'Escape') {
                    event.preventDefault()
                    setFilterMenuColumn(null)
                  }
                }}
              />
            </label>
          )}
          <div className="grid-col-filter-actions">
            <button type="button" className="btn btn-ghost tiny-btn" onClick={() => clearOneColumnFilter(filterMenuColumn)}>
              清除
            </button>
            <button type="button" className="btn btn-primary tiny-btn" onClick={applyColumnFilterDraft}>
              应用
            </button>
          </div>
        </div>
      )}
    <div
      className="grid-wrap"
      ref={parentRef}
      tabIndex={0}
      role="grid"
      aria-label="结果表格"
      aria-rowcount={displayRows.length}
      aria-colcount={displayColumns.length + 1}
      onKeyDown={(event: KeyboardEvent) => {
        if (event.key === 'Escape' && findOpen) {
          event.preventDefault()
          closeFind()
          return
        }
        if ((event.ctrlKey || event.metaKey) && !event.shiftKey && event.key.toLowerCase() === 'f' && !editing) {
          event.preventDefault()
          setFindOpen(true)
          queueMicrotask(() => findInputRef.current?.focus())
          return
        }
        if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'c' && !editing) {
          event.preventDefault()
          if (selectedIndexes.size > 0) void copySelectedAsTsv()
          else void copyFocused()
          return
        }
        if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'a' && !editing) {
          event.preventDefault()
          setSelectedIndexes(selectAllRowIndexes(displayRows.length))
          selectionAnchorRef.current = 0
          return
        }
        if (event.key === 'Escape' && !editing) {
          if (selectedIndexes.size > 0) {
            event.preventDefault()
            setSelectedIndexes(new Set())
            selectionAnchorRef.current = null
          }
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
      <table className={colWidths ? "grid is-virtual has-col-widths" : "grid is-virtual"}>
        {colWidths && (
          <colgroup>
            <col className="row-index-col" style={{ width: 48 }} />
            {displayColumns.map((column) => (
              <col key={column} style={{ width: colWidths[column] }} />
            ))}
          </colgroup>
        )}
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
                    colWidths?.[column] != null ? 'has-autofit' : '',
                    isColumnFilterActive(columnFilters[column]) ? 'is-col-filtered' : '',
                  ]
                    .filter(Boolean)
                    .join(' ')}
                  style={columnBoxStyle(column, pinnedAt)}
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
                  <span
                    className="grid-col-resizer"
                    title="双击：列宽适应"
                    onDoubleClick={(event) => {
                      event.preventDefault()
                      event.stopPropagation()
                      autofitOneColumn(column)
                    }}
                  />
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
                aria-selected={selectedIndexes.has(rowIndex)}
                className={[
                  focus.row === rowIndex ? 'is-active' : '',
                  selectedIndexes.has(rowIndex) ? 'is-selected' : '',
                ]
                  .filter(Boolean)
                  .join(' ') || undefined}
                style={{ height: ROW_HEIGHT }}
              >
                <th
                  className="row-index"
                  scope="row"
                  title="单击选择 · Ctrl 多选 · Shift 范围"
                  onClick={(event) => {
                    event.preventDefault()
                    selectRow(rowIndex, event)
                  }}
                >
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
                      title={
                        (() => {
                          const hint = cellDisplayHint(value)
                          return `${hint}（${cellCopyClickHint(canEditSqlite)}）`
                        })()
                      }
                      className={[
                        numeric[column] ? 'is-number' : '',
                        cellDisplayKind(value) === 'null' ? 'is-null' : '',
                        cellDisplayKind(value) === 'empty' ? 'is-empty' : '',
                        focused ? 'is-focused' : '',
                        pinnedAt >= 0 ? `is-pinned is-pinned-${pinnedAt}` : '',
                        colWidths?.[column] != null ? 'has-autofit' : '',
                        findOpen &&
                        findQuery.trim() &&
                        findHits.some((hit) => hit.row === rowIndex && hit.col === colIndex)
                          ? findCurrent?.row === rowIndex && findCurrent.col === colIndex
                            ? 'is-find-current'
                            : 'is-find-hit'
                          : '',
                      ]
                        .filter(Boolean)
                        .join(' ')}
                      style={columnBoxStyle(column, pinnedAt)}
                      onClick={(event) => {
                        selectRow(rowIndex, event)
                        setFocus({ row: rowIndex, col: colIndex })
                      }}
                      onDoubleClick={(event) => {
                        if (event.shiftKey) {
                          event.preventDefault()
                          void copyCellAt(rowIndex, colIndex)
                          return
                        }
                        openCellPreview(rowIndex, colIndex)
                      }}
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
          <button
            type="button"
            role="menuitem"
            onClick={() => openColumnFilter(contextMenu.column)}
          >
            列筛选…
          </button>
          <button
            type="button"
            role="menuitem"
            disabled={!canHideColumn(columns, hiddenColumns, contextMenu.column)}
            onClick={() => {
              toggleColumnVisibility(contextMenu.column, false)
              setContextMenu(null)
            }}
          >
            隐藏此列
          </button>
          <button
            type="button"
            role="menuitem"
            onClick={() => autofitOneColumn(contextMenu.column)}
          >
            列宽适应（本列）
          </button>
          <button type="button" role="menuitem" onClick={() => autofitAllColumns()}>
            列宽适应（全部）
          </button>
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
                onClick={() => {
                  const colIndex = displayColumns.indexOf(contextMenu.column)
                  if (colIndex >= 0) openCellPreview(contextMenu.rowIndex!, colIndex)
                }}
              >
                查看单元格
              </button>
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
          {selectedIndexes.size > 0 && (
            <>
              <button type="button" role="menuitem" onClick={() => void copySelectedAsTsv()}>
                复制选中行 TSV（{selectedIndexes.size}）
              </button>
              <button type="button" role="menuitem" onClick={() => void copySelectedAsCsv()}>
                复制选中行 CSV
              </button>
              <button
                type="button"
                role="menuitem"
                onClick={() => void copySelectedAsIn(contextMenu.column)}
              >
                复制选中列 IN
              </button>
              <button type="button" role="menuitem" onClick={() => void copySelectedAsValues()}>
                复制选中行 VALUES
              </button>
            </>
          )}
        </div>
      )}
      <CellValuePreviewDialog
        open={cellPreview != null}
        column={cellPreview?.column ?? ''}
        rowIndex={cellPreview?.rowIndex ?? 0}
        value={cellPreview?.value}
        onClose={() => setCellPreview(null)}
      />
      {note && <p className="result-footnote">{note}</p>}
      <p className="result-footnote">
        表头点击排序；单击行号/单元格选择，Ctrl 多选、Shift 范围；右键可复制选中行 TSV/CSV/IN/VALUES；「钉」固定最多 2 列；「列宽适应」或表头分隔线双击估算列宽；表头「筛」可按列筛选（与上方筛选框叠加）；「显示列」可隐藏列；双击查看单元格全文，Shift+双击复制单元格；NULL 与空字符串 "" 分别显示。
        {sort ? ` 当前排序：${sort.column} ${sort.direction === 'asc' ? '升序' : '降序'}。` : ''}
      </p>
      {canEditSqlite && <p className="result-footnote">SQLite：双击查看 · Shift+双击复制；Enter 进入编辑（需确认）。隐藏列 __rowid__ 用于定位行。</p>}
    </div>
    </div>
  )
}
