import { useEffect, useMemo, useRef, useState } from 'react'
import { filterCommands, type CommandDef } from '@shared/commands'
import {
  filterRecentQueries,
  filterRecentTables,
  recentQueryTitle,
  type RecentQueryItem,
  type RecentTableItem,
} from '@shared/recentItems'

type PaletteRow =
  | { kind: 'section'; id: string; label: string }
  | { kind: 'command'; id: string; command: CommandDef }
  | { kind: 'table'; id: string; item: RecentTableItem }
  | { kind: 'query'; id: string; item: RecentQueryItem }

type CommandPaletteProps = {
  open: boolean
  onClose: () => void
  onRun: (command: CommandDef) => void
  recentTables?: RecentTableItem[]
  recentQueries?: RecentQueryItem[]
  onOpenRecentTable?: (item: RecentTableItem) => void
  onOpenRecentQuery?: (item: RecentQueryItem) => void
}

export function CommandPalette({
  open,
  onClose,
  onRun,
  recentTables = [],
  recentQueries = [],
  onOpenRecentTable,
  onOpenRecentQuery,
}: CommandPaletteProps) {
  const [query, setQuery] = useState('')
  const [active, setActive] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)
  const listRef = useRef<HTMLDivElement>(null)

  const rows = useMemo((): PaletteRow[] => {
    const q = query.trim()
    const tables = filterRecentTables(recentTables, q).slice(0, q ? 8 : 5)
    const queries = filterRecentQueries(recentQueries, q).slice(0, q ? 8 : 5)
    const commands = filterCommands(query)
    const next: PaletteRow[] = []
    if (tables.length > 0) {
      next.push({ kind: 'section', id: 'sec-tables', label: '最近表' })
      for (const item of tables) {
        next.push({
          kind: 'table',
          id: `table:${item.connectionId}:${item.tableName}`,
          item,
        })
      }
    }
    if (queries.length > 0) {
      next.push({ kind: 'section', id: 'sec-queries', label: '最近查询' })
      for (const item of queries) {
        next.push({
          kind: 'query',
          id: `query:${item.at}:${item.sql.slice(0, 24)}`,
          item,
        })
      }
    }
    if (commands.length > 0) {
      if (tables.length > 0 || queries.length > 0) {
        next.push({ kind: 'section', id: 'sec-cmds', label: '命令' })
      }
      for (const command of commands) {
        next.push({ kind: 'command', id: command.id, command })
      }
    }
    return next
  }, [query, recentTables, recentQueries])

  const selectable = useMemo(
    () => rows.filter((row) => row.kind !== 'section'),
    [rows],
  )

  useEffect(() => {
    if (!open) return
    setQuery('')
    setActive(0)
    const handle = window.setTimeout(() => inputRef.current?.focus(), 0)
    return () => window.clearTimeout(handle)
  }, [open])

  useEffect(() => {
    setActive(0)
  }, [query])

  useEffect(() => {
    if (!open) return
    const node = listRef.current?.querySelector<HTMLElement>(`[data-cmd-index="${active}"]`)
    node?.scrollIntoView({ block: 'nearest' })
  }, [active, open, selectable.length])

  if (!open) return null

  const runAt = (index: number) => {
    const row = selectable[index]
    if (!row) return
    onClose()
    window.setTimeout(() => {
      if (row.kind === 'command') onRun(row.command)
      else if (row.kind === 'table') onOpenRecentTable?.(row.item)
      else if (row.kind === 'query') onOpenRecentQuery?.(row.item)
    }, 0)
  }

  return (
    <div
      className="palette-overlay"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose()
      }}
    >
      <div
        className="palette"
        role="dialog"
        aria-modal="true"
        aria-label="命令面板"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="palette-search">
          <input
            ref={inputRef}
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="搜索命令 / 最近表 / 最近查询…"
            aria-label="搜索命令"
            onKeyDown={(event) => {
              if (event.key === 'Escape') {
                event.preventDefault()
                onClose()
              } else if (event.key === 'ArrowDown') {
                event.preventDefault()
                setActive((index) => Math.min(selectable.length - 1, index + 1))
              } else if (event.key === 'ArrowUp') {
                event.preventDefault()
                setActive((index) => Math.max(0, index - 1))
              } else if (event.key === 'Enter') {
                event.preventDefault()
                runAt(active)
              }
            }}
          />
          <kbd className="palette-kbd">Esc</kbd>
        </div>
        <div className="palette-list" role="listbox" aria-label="命令列表" ref={listRef}>
          {selectable.length === 0 && <p className="palette-empty">没有匹配的命令或最近项</p>}
          {rows.map((row) => {
            if (row.kind === 'section') {
              return (
                <div key={row.id} className="palette-section" role="presentation">
                  {row.label}
                </div>
              )
            }
            const index = selectable.findIndex((item) => item.id === row.id)
            const isActive = index === active
            if (row.kind === 'command') {
              return (
                <button
                  key={row.id}
                  type="button"
                  role="option"
                  data-cmd-index={index}
                  aria-selected={isActive}
                  className={isActive ? 'palette-item is-active' : 'palette-item'}
                  onMouseEnter={() => setActive(index)}
                  onClick={() => runAt(index)}
                >
                  <span className="palette-item-main">
                    <span className="palette-title">{row.command.title}</span>
                    {row.command.subtitle && <span className="palette-sub">{row.command.subtitle}</span>}
                  </span>
                  {row.command.shortcut && <kbd className="palette-shortcut">{row.command.shortcut}</kbd>}
                </button>
              )
            }
            if (row.kind === 'table') {
              return (
                <button
                  key={row.id}
                  type="button"
                  role="option"
                  data-cmd-index={index}
                  aria-selected={isActive}
                  className={isActive ? 'palette-item is-active' : 'palette-item'}
                  onMouseEnter={() => setActive(index)}
                  onClick={() => runAt(index)}
                >
                  <span className="palette-item-main">
                    <span className="palette-title">{row.item.tableName}</span>
                    <span className="palette-sub">
                      {row.item.connectionName || '连接'} · 最近表
                    </span>
                  </span>
                  <kbd className="palette-shortcut">表</kbd>
                </button>
              )
            }
            return (
              <button
                key={row.id}
                type="button"
                role="option"
                data-cmd-index={index}
                aria-selected={isActive}
                className={isActive ? 'palette-item is-active' : 'palette-item'}
                onMouseEnter={() => setActive(index)}
                onClick={() => runAt(index)}
              >
                <span className="palette-item-main">
                  <span className="palette-title">{recentQueryTitle(row.item.sql)}</span>
                  <span className="palette-sub">
                    {row.item.connectionName || '查询'} · 最近查询
                  </span>
                </span>
                <kbd className="palette-shortcut">SQL</kbd>
              </button>
            )
          })}
        </div>
        <footer className="palette-foot">
          <span>↑↓ 选择</span>
          <span>Enter 执行</span>
          <span>Ctrl+K 打开</span>
        </footer>
      </div>
    </div>
  )
}
