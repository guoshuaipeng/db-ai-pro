import { useEffect, useMemo, useRef, useState } from 'react'
import {
  COMMAND_CATEGORY_FILTERS,
  filterCommands,
  filterCommandsByCategory,
  formatCommandClipboard,
  commandCopiedToast,
  paletteEmptyBody,
  type CommandCategoryFilter,
  type CommandDef,
} from '@shared/commands'
import { EmptyState } from './EmptyState'
import {
  buildSchemaObjectIndex,
  searchGlobalObjects,
  type FavoriteHit,
  type GlobalSearchHit,
  type SchemaColumnHit,
  type SchemaTableHit,
} from '@shared/globalSearch'
import {
  filterRecentQueries,
  filterRecentTables,
  recentQueryTitle,
  type RecentQueryItem,
  type RecentTableItem,
} from '@shared/recentItems'
import {
  defaultSnippetValues,
  expandSnippet,
  extractSnippetVars,
  hasSnippetVars,
} from '@shared/snippetVars'
import type { SchemaNode, SqlFavorite } from '@shared/types'

type PaletteRow =
  | { kind: 'section'; id: string; label: string }
  | { kind: 'command'; id: string; command: CommandDef }
  | { kind: 'recent-table'; id: string; item: RecentTableItem }
  | { kind: 'recent-query'; id: string; item: RecentQueryItem }
  | { kind: 'schema-table'; id: string; item: SchemaTableHit }
  | { kind: 'schema-column'; id: string; item: SchemaColumnHit }
  | { kind: 'favorite'; id: string; item: FavoriteHit }

type CommandPaletteProps = {
  open: boolean
  onClose: () => void
  onRun: (command: CommandDef) => void
  recentTables?: RecentTableItem[]
  recentQueries?: RecentQueryItem[]
  onOpenRecentTable?: (item: RecentTableItem) => void
  onOpenRecentQuery?: (item: RecentQueryItem) => void
  schema?: SchemaNode[]
  connectionId?: string | null
  connectionName?: string
  targetTable?: string
  favorites?: SqlFavorite[]
  onOpenSchemaTable?: (item: SchemaTableHit) => void
  onOpenSchemaColumn?: (item: SchemaColumnHit) => void
  onInsertFavorite?: (sql: string) => void
}

export function CommandPalette({
  open,
  onClose,
  onRun,
  recentTables = [],
  recentQueries = [],
  onOpenRecentTable,
  onOpenRecentQuery,
  schema = [],
  connectionId = null,
  targetTable = '',
  favorites = [],
  onOpenSchemaTable,
  onOpenSchemaColumn,
  onInsertFavorite,
}: CommandPaletteProps) {
  const [query, setQuery] = useState('')
  const [debounced, setDebounced] = useState('')
  const [category, setCategory] = useState<CommandCategoryFilter>('all')
  const [active, setActive] = useState(0)
  const [copyNote, setCopyNote] = useState('')
  const [pendingFav, setPendingFav] = useState<SqlFavorite | null>(null)
  const [varValues, setVarValues] = useState<Record<string, string>>({})
  const inputRef = useRef<HTMLInputElement>(null)
  const listRef = useRef<HTMLDivElement>(null)

  const index = useMemo(
    () => buildSchemaObjectIndex(schema, connectionId),
    [schema, connectionId],
  )

  useEffect(() => {
    const handle = window.setTimeout(() => setDebounced(query), 120)
    return () => window.clearTimeout(handle)
  }, [query])

  const objectHits = useMemo((): GlobalSearchHit[] => {
    if (!debounced.trim()) return []
    return searchGlobalObjects(debounced, index, favorites, {
      connectionId,
      limit: 24,
    })
  }, [debounced, index, favorites, connectionId])

  const rows = useMemo((): PaletteRow[] => {
    const q = debounced.trim()
    const next: PaletteRow[] = []

    if (q) {
      const tables = objectHits.filter((h): h is SchemaTableHit => h.kind === 'schema-table')
      const columns = objectHits.filter((h): h is SchemaColumnHit => h.kind === 'schema-column')
      const favHits = objectHits.filter((h): h is FavoriteHit => h.kind === 'favorite')
      if (tables.length) {
        next.push({ kind: 'section', id: 'sec-obj-tables', label: '表' })
        for (const item of tables.slice(0, 10)) {
          next.push({
            kind: 'schema-table',
            id: `obj-table:${item.connectionId}:${item.tableName}`,
            item,
          })
        }
      }
      if (columns.length) {
        next.push({ kind: 'section', id: 'sec-obj-cols', label: '列' })
        for (const item of columns.slice(0, 10)) {
          next.push({
            kind: 'schema-column',
            id: `obj-col:${item.connectionId}:${item.tableName}:${item.columnName}`,
            item,
          })
        }
      }
      if (favHits.length) {
        next.push({ kind: 'section', id: 'sec-obj-fav', label: '收藏' })
        for (const item of favHits.slice(0, 8)) {
          next.push({
            kind: 'favorite',
            id: `obj-fav:${item.favorite.id}`,
            item,
          })
        }
      }
    }

    const recentT = filterRecentTables(recentTables, q).slice(0, q ? 5 : 5)
    const recentQ = filterRecentQueries(recentQueries, q).slice(0, q ? 5 : 5)
    if (recentT.length) {
      next.push({ kind: 'section', id: 'sec-tables', label: '最近表' })
      for (const item of recentT) {
        next.push({
          kind: 'recent-table',
          id: `recent-table:${item.connectionId}:${item.tableName}`,
          item,
        })
      }
    }
    if (recentQ.length) {
      next.push({ kind: 'section', id: 'sec-queries', label: '最近查询' })
      for (const item of recentQ) {
        next.push({
          kind: 'recent-query',
          id: `recent-query:${item.at}:${item.sql.slice(0, 24)}`,
          item,
        })
      }
    }

    const commands = filterCommandsByCategory(filterCommands(query), category)
    if (commands.length) {
      if (next.length) next.push({ kind: 'section', id: 'sec-cmds', label: '命令' })
      for (const command of commands) {
        next.push({ kind: 'command', id: command.id, command })
      }
    }
    return next
  }, [debounced, query, category, objectHits, recentTables, recentQueries])

  const selectable = useMemo(() => rows.filter((row) => row.kind !== 'section'), [rows])

  useEffect(() => {
    if (!open) return
    setQuery('')
    setDebounced('')
    setCategory('all')
    setActive(0)
    setPendingFav(null)
    setCopyNote('')
    const handle = window.setTimeout(() => inputRef.current?.focus(), 0)
    return () => window.clearTimeout(handle)
  }, [open])

  useEffect(() => {
    setActive(0)
  }, [debounced, query, category])

  useEffect(() => {
    if (!open || pendingFav) return
    const node = listRef.current?.querySelector<HTMLElement>(`[data-cmd-index="${active}"]`)
    node?.scrollIntoView({ block: 'nearest' })
  }, [active, open, selectable.length, pendingFav])

  if (!open) return null

  const beginFavorite = (fav: SqlFavorite) => {
    if (!hasSnippetVars(fav.sql)) {
      onClose()
      window.setTimeout(() => onInsertFavorite?.(fav.sql), 0)
      return
    }
    setPendingFav(fav)
    setVarValues(
      defaultSnippetValues(extractSnippetVars(fav.sql), {
        table: targetTable || null,
        limit: '100',
      }),
    )
  }

  const confirmFavorite = () => {
    if (!pendingFav) return
    const expanded = expandSnippet(pendingFav.sql, varValues)
    setPendingFav(null)
    onClose()
    window.setTimeout(() => onInsertFavorite?.(expanded), 0)
  }

  const runAt = (index: number) => {
    const row = selectable[index]
    if (!row) return
    if (row.kind === 'favorite') {
      beginFavorite(row.item.favorite)
      return
    }
    onClose()
    window.setTimeout(() => {
      if (row.kind === 'command') onRun(row.command)
      else if (row.kind === 'recent-table') onOpenRecentTable?.(row.item)
      else if (row.kind === 'recent-query') onOpenRecentQuery?.(row.item)
      else if (row.kind === 'schema-table') onOpenSchemaTable?.(row.item)
      else if (row.kind === 'schema-column') onOpenSchemaColumn?.(row.item)
    }, 0)
  }

  const copyActive = () => {
    const row = selectable[active]
    if (!row || row.kind !== 'command') {
      setCopyNote('请先选中一条命令再复制')
      return
    }
    const text = formatCommandClipboard(row.command)
    void navigator.clipboard.writeText(text).then(
      () => {
        setCopyNote(commandCopiedToast(row.command))
        window.setTimeout(() => setCopyNote(''), 1600)
      },
      () => setCopyNote('复制失败'),
    )
  }

  if (pendingFav) {
    const vars = extractSnippetVars(pendingFav.sql)
    return (
      <div
        className="palette-overlay"
        role="presentation"
        onMouseDown={(event) => {
          if (event.target === event.currentTarget) {
            setPendingFav(null)
            onClose()
          }
        }}
      >
        <div
          className="palette palette-vars"
          role="dialog"
          aria-modal="true"
          aria-label="填写片段变量"
          onMouseDown={(event) => event.stopPropagation()}
        >
          <h2 className="palette-vars-title">填写片段变量</h2>
          <p className="palette-vars-copy">「{pendingFav.name}」</p>
          <div className="snippet-var-fields">
            {vars.map((varName, index) => (
              <label key={varName} className="field">
                <span>{`{{${varName}}}`}</span>
                <input
                  className="fav-input"
                  value={varValues[varName] ?? ''}
                  autoFocus={index === 0}
                  spellCheck={false}
                  onChange={(e) => setVarValues((prev) => ({ ...prev, [varName]: e.target.value }))}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault()
                      confirmFavorite()
                    }
                    if (e.key === 'Escape') {
                      e.preventDefault()
                      setPendingFav(null)
                    }
                  }}
                />
              </label>
            ))}
          </div>
          <pre className="snippet-var-preview">{expandSnippet(pendingFav.sql, varValues)}</pre>
          <div className="dialog-actions">
            <button type="button" className="btn btn-ghost" onClick={() => setPendingFav(null)}>
              返回
            </button>
            <button type="button" className="btn btn-primary" onClick={confirmFavorite}>
              插入
            </button>
          </div>
        </div>
      </div>
    )
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
        aria-label="命令与对象搜索"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="palette-search">
          <input
            ref={inputRef}
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="搜索表 / 列 / 收藏 / 命令…（Ctrl+K · Ctrl+P）"
            aria-label="全局搜索"
            onKeyDown={(event) => {
              if (event.key === 'Escape') {
                event.preventDefault()
                if (query.trim()) {
                  setQuery('')
                  setDebounced('')
                  return
                }
                if (category !== 'all') {
                  setCategory('all')
                  return
                }
                onClose()
              } else if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'c') {
                const input = event.currentTarget
                const hasSelection =
                  (input.selectionStart ?? 0) !== (input.selectionEnd ?? 0)
                if (hasSelection) return
                const row = selectable[active]
                if (row?.kind === 'command') {
                  event.preventDefault()
                  copyActive()
                }
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
        <div className="palette-categories" role="tablist" aria-label="命令分类">
          {COMMAND_CATEGORY_FILTERS.map((item) => (
            <button
              key={item.id}
              type="button"
              role="tab"
              aria-selected={category === item.id}
              className={category === item.id ? 'palette-cat is-active' : 'palette-cat'}
              onClick={() => setCategory(item.id)}
            >
              {item.label}
            </button>
          ))}
        </div>
        <div className="palette-list" role="listbox" aria-label="搜索结果" ref={listRef}>
          {selectable.length === 0 && (
            <EmptyState
              compact
              kicker="命令面板"
              title={query.trim() ? '没有匹配项' : '开始搜索或浏览分类'}
              body={paletteEmptyBody(Boolean(query.trim()), category)}
              actions={
                <>
                  {category !== 'all' ? (
                    <button type="button" className="btn btn-ghost" onClick={() => setCategory('all')}>
                      查看全部分类
                    </button>
                  ) : null}
                  {query.trim() ? (
                    <button
                      type="button"
                      className="btn btn-ghost"
                      onClick={() => {
                        setQuery('')
                        setDebounced('')
                      }}
                    >
                      清除关键字
                    </button>
                  ) : null}
                </>
              }
            />
          )}
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
            const cls = isActive ? 'palette-item is-active' : 'palette-item'
            if (row.kind === 'command') {
              return (
                <button
                  key={row.id}
                  type="button"
                  role="option"
                  data-cmd-index={index}
                  aria-selected={isActive}
                  className={cls}
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
            if (row.kind === 'recent-table') {
              return (
                <button
                  key={row.id}
                  type="button"
                  role="option"
                  data-cmd-index={index}
                  aria-selected={isActive}
                  className={cls}
                  onMouseEnter={() => setActive(index)}
                  onClick={() => runAt(index)}
                >
                  <span className="palette-item-main">
                    <span className="palette-title">{row.item.tableName}</span>
                    <span className="palette-sub">{row.item.connectionName || '连接'} · 最近表</span>
                  </span>
                  <kbd className="palette-shortcut">表</kbd>
                </button>
              )
            }
            if (row.kind === 'recent-query') {
              return (
                <button
                  key={row.id}
                  type="button"
                  role="option"
                  data-cmd-index={index}
                  aria-selected={isActive}
                  className={cls}
                  onMouseEnter={() => setActive(index)}
                  onClick={() => runAt(index)}
                >
                  <span className="palette-item-main">
                    <span className="palette-title">{recentQueryTitle(row.item.sql)}</span>
                    <span className="palette-sub">{row.item.connectionName || '查询'} · 最近查询</span>
                  </span>
                  <kbd className="palette-shortcut">SQL</kbd>
                </button>
              )
            }
            if (row.kind === 'schema-table') {
              return (
                <button
                  key={row.id}
                  type="button"
                  role="option"
                  data-cmd-index={index}
                  aria-selected={isActive}
                  className={cls}
                  onMouseEnter={() => setActive(index)}
                  onClick={() => runAt(index)}
                >
                  <span className="palette-item-main">
                    <span className="palette-title">{row.item.tableName}</span>
                    <span className="palette-sub">
                      {row.item.connectionName} · Enter 打开查询
                    </span>
                  </span>
                  <kbd className="palette-shortcut">表</kbd>
                </button>
              )
            }
            if (row.kind === 'schema-column') {
              return (
                <button
                  key={row.id}
                  type="button"
                  role="option"
                  data-cmd-index={index}
                  aria-selected={isActive}
                  className={cls}
                  onMouseEnter={() => setActive(index)}
                  onClick={() => runAt(index)}
                >
                  <span className="palette-item-main">
                    <span className="palette-title">
                      {row.item.tableName}.{row.item.columnName}
                    </span>
                    <span className="palette-sub">
                      {row.item.dataType || '列'} · Enter 打开结构
                    </span>
                  </span>
                  <kbd className="palette-shortcut">列</kbd>
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
                className={cls}
                onMouseEnter={() => setActive(index)}
                onClick={() => runAt(index)}
              >
                <span className="palette-item-main">
                  <span className="palette-title">{row.item.favorite.name}</span>
                  <span className="palette-sub">
                    {row.item.favorite.sql.replace(/\s+/g, ' ').slice(0, 64)}
                    {hasSnippetVars(row.item.favorite.sql) ? ' · 含变量' : ''}
                  </span>
                </span>
                <kbd className="palette-shortcut">收藏</kbd>
              </button>
            )
          })}
        </div>
        <footer className="palette-foot">
          <span>↑↓ 选择</span>
          <span>Enter 打开</span>
          <span>Ctrl+C 复制命令</span>
          <span>{selectable.length} 项</span>
          {copyNote ? <span className="palette-copy-note">{copyNote}</span> : null}
        </footer>
      </div>
    </div>
  )
}
