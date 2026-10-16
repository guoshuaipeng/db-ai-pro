import { useEffect, useState } from 'react'
import { IconPlay, IconPlus } from './icons'
import { ScrollTabs } from './ScrollTabs'
import { SqlEditor } from './SqlEditor'
import { formatCell, isNumericColumn } from '../format'
import { useWorkspace } from '../state/workspace'

export function EditorPane() {
  const ws = useWorkspace()

  return (
    <section className="editor-pane" aria-label="SQL 编辑器">
      <ScrollTabs
        label="查询标签"
        tabs={ws.editorTabs.map((tab) => ({ id: tab.id, label: tab.title }))}
        activeId={ws.activeEditor?.id ?? ''}
        onSelect={ws.setActiveEditor}
        onClose={ws.closeTab}
        trailing={
          <div className="tab-actions">
            <button type="button" className="icon-btn" aria-label="新建查询" onClick={ws.newTab}>
              <IconPlus />
            </button>
            <button type="button" className="btn btn-primary run-btn" onClick={() => void ws.run()} disabled={ws.running}>
              <IconPlay />
              {ws.running ? '执行中' : '运行'}
            </button>
          </div>
        }
      />
      {ws.activeEditor && (
        <SqlEditor value={ws.activeEditor.sql} onChange={ws.updateSql} onCursor={ws.setCursor} />
      )}
    </section>
  )
}

export function ResultPane() {
  const ws = useWorkspace()
  const results = ws.results
  const active = results?.tabs.find((tab) => tab.id === results.activeId) ?? null

  return (
    <section className="result-pane" aria-label="查询结果">
      {results && results.tabs.length > 0 ? (
        <ScrollTabs
          label="结果标签"
          tabs={results.tabs.map((tab) => ({ id: tab.id, label: tab.title }))}
          activeId={results.activeId}
          onSelect={ws.setActiveResult}
          trailing={
            active?.kind === 'grid' ? (
              <span className="result-count">{active.rows?.length ?? 0} 行</span>
            ) : (
              <span className="result-count">输出</span>
            )
          }
        />
      ) : (
        <div className="result-head">结果</div>
      )}
      {!results && (
        <div className="result-empty">
          <p>运行当前语句后，结果会显示在这里。</p>
          <p className="hint">F5 或 Ctrl/⌘ Enter</p>
        </div>
      )}
      {active?.kind === 'message' && <pre className="message-log">{active.message}</pre>}
      {active?.kind === 'grid' && active.columns && (
        <ResultGrid columns={active.columns} rows={active.rows ?? []} key={active.id} />
      )}
      {active?.kind === 'grid' && active.rows?.length === 0 && <p className="result-footnote">这条语句没有返回行。</p>}
    </section>
  )
}

function ResultGrid({ columns, rows }: { columns: string[]; rows: Record<string, unknown>[] }) {
  const numeric = Object.fromEntries(columns.map((column) => [column, isNumericColumn(rows, column)]))
  const [focus, setFocus] = useState({ row: 0, col: 0 })

  useEffect(() => {
    setFocus({ row: 0, col: 0 })
  }, [columns, rows])

  const move = (rowDelta: number, colDelta: number) => {
    setFocus((current) => ({
      row: Math.min(Math.max(0, current.row + rowDelta), Math.max(0, rows.length - 1)),
      col: Math.min(Math.max(0, current.col + colDelta), Math.max(0, columns.length - 1)),
    }))
  }

  return (
    <div
      className="grid-wrap"
      tabIndex={0}
      role="grid"
      aria-label="结果表格"
      aria-rowcount={rows.length}
      aria-colcount={columns.length + 1}
      onKeyDown={(event) => {
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
          setFocus((current) => ({ ...current, col: columns.length - 1 }))
        }
      }}
    >
      <table className="grid">
        <thead>
          <tr role="row">
            <th className="row-index" scope="col" />
            {columns.map((column) => (
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
              {columns.map((column, colIndex) => {
                const value = row[column]
                const text = formatCell(value)
                const focused = focus.row === rowIndex && focus.col === colIndex
                return (
                  <td
                    key={column}
                    role="gridcell"
                    title={text}
                    className={[
                      numeric[column] ? 'is-number' : '',
                      value == null ? 'is-null' : '',
                      focused ? 'is-focused' : '',
                    ]
                      .filter(Boolean)
                      .join(' ')}
                  >
                    {text}
                  </td>
                )
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
