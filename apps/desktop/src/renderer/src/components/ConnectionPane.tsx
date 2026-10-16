import { useEffect, useMemo, useRef, useState } from 'react'
import { emitDataai, onDataai } from '../appEvents'
import { dialectInfo } from '@shared/types'
import { formatLatency } from '@shared/connHealth'
import { bucketSchemaByGroup, colorForTag, CONN_COLOR_TAGS } from '@shared/connGroups'
import { quoteIdentIfNeeded } from '@shared/sql'
import { isTreeNodeExpanded } from '@shared/schemaTreeRefresh'
import { qualifyBrowseTable } from '@shared/tablePaging'
import { setSqlDragData } from '@shared/sqlDragDrop'
import type { Dialect, SchemaNode } from '@shared/types'
import { IconColumn, IconDatabase, IconMore, IconPlus, IconRefresh, IconSearch, IconTable } from './icons'
import { EmptyState } from './EmptyState'
import { useWorkspace } from '../state/workspace'
import { recentQueryTitle } from '@shared/recentItems'

export function ConnectionPane() {
  const ws = useWorkspace()
  const [menuId, setMenuId] = useState<string | null>(null)
  const [groupDraft, setGroupDraft] = useState('')
  const [renamingGroupId, setRenamingGroupId] = useState<string | null>(null)
  const [renameDraft, setRenameDraft] = useState('')
  const root = useRef<HTMLElement>(null)

  const buckets = useMemo(
    () => bucketSchemaByGroup(ws.filteredSchema, ws.connections, ws.connectionGroups),
    [ws.filteredSchema, ws.connections, ws.connectionGroups],
  )
  const searchRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    const close = (event: MouseEvent) => {
      if (!root.current?.contains(event.target as Node)) setMenuId(null)
    }
    window.addEventListener('mousedown', close)
    return () => window.removeEventListener('mousedown', close)
  }, [])

  useEffect(() => onDataai('dataai:focus-tree-search', () => {
    if (!ws.sidebarOpen) ws.toggleSidebar()
    window.setTimeout(() => {
      searchRef.current?.focus()
      searchRef.current?.select()
    }, 0)
  }), [ws])

  return (
    <aside className="sidebar" ref={root} aria-label="连接">
      <div className="side-head">
        <h1>连接</h1>
        <div className="side-head-actions">
          <button type="button" className="tiny-btn btn btn-ghost" onClick={() => void ws.importConnections()}>
            导入
          </button>
          <button type="button" className="tiny-btn btn btn-ghost" onClick={() => void ws.exportConnections()}>
            导出
          </button>
          <button
            type="button"
            className={ws.schemaRefreshing ? 'icon-btn is-spinning' : 'icon-btn'}
            aria-label="刷新对象树"
            title="刷新对象树"
            disabled={ws.schemaRefreshing}
            onClick={() => void ws.refreshSchemaTree()}
          >
            <IconRefresh />
          </button>
          <button type="button" className="icon-btn" aria-label="新建连接" onClick={ws.openCreate}>
            <IconPlus />
          </button>
        </div>
      </div>
      <label className="search">
        <IconSearch />
        <input
          ref={searchRef}
          value={ws.search}
          onChange={(event) => ws.setSearch(event.target.value)}
          placeholder="搜索主机 / 库 / 表 / 列"
          aria-label="搜索主机、数据库、表或列"
        />
        {ws.search.trim() && (
          <button type="button" className="search-clear" aria-label="清除搜索" onClick={() => ws.setSearch('')}>
            ×
          </button>
        )}
      </label>
      {ws.search.trim() && ws.filteredSchema.length > 0 && (
        <p className="search-stats">
          {ws.searchStats.connections} 连接 · {ws.searchStats.tables} 表 · {ws.searchStats.columns} 列
        </p>
      )}

      {(ws.recentTables.length > 0 || ws.recentQueries.length > 0) && !ws.search.trim() && (
        <div className="recent-side" aria-label="最近">
          <div className="recent-side-head">
            <span>最近</span>
            <button type="button" className="tiny-btn btn btn-ghost" onClick={() => void ws.clearRecent()}>
              清空
            </button>
          </div>
          {ws.recentTables.slice(0, 6).map((item) => (
            <button
              key={`t:${item.connectionId}:${item.tableName}`}
              type="button"
              className="recent-side-item"
              title={`${item.connectionName} / ${item.tableName}`}
              onClick={() => ws.openRecentTable(item)}
            >
              <IconTable />
              <span className="recent-side-text">
                <span className="recent-side-title">{item.tableName}</span>
                <span className="recent-side-sub">{item.connectionName || '表'}</span>
              </span>
            </button>
          ))}
          {ws.recentQueries.slice(0, 4).map((item) => (
            <button
              key={`q:${item.connectionId ?? 'g'}:${item.at}`}
              type="button"
              className="recent-side-item"
              title={item.sql}
              onClick={() => ws.openRecentQuery(item)}
            >
              <span className="recent-side-sql-badge">SQL</span>
              <span className="recent-side-text">
                <span className="recent-side-title">{recentQueryTitle(item.sql, 40)}</span>
                <span className="recent-side-sub">{item.connectionName || '查询'}</span>
              </span>
            </button>
          ))}
        </div>
      )}
      <div className="conn-group-bar">
        <input
          className="fav-input"
          value={groupDraft}
          onChange={(e) => setGroupDraft(e.target.value)}
          placeholder="新建连接分组"
          aria-label="新建连接分组"
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault()
              const name = groupDraft.trim()
              if (!name) return
              void ws.saveConnectionGroup({ name }).then(() => setGroupDraft(''))
            }
          }}
        />
        <button
          type="button"
          className="btn btn-ghost tiny-btn"
          disabled={!groupDraft.trim()}
          onClick={() => {
            const name = groupDraft.trim()
            if (!name) return
            void ws.saveConnectionGroup({ name }).then(() => setGroupDraft(''))
          }}
        >
          新建分组
        </button>
      </div>

      {ws.connections.length === 0 ? (
        <EmptyState
          kicker="开始使用"
          title="还没有数据库连接"
          body="先添加一个连接。SQLite / MySQL / MariaDB / PostgreSQL / SQL Server 可直接查询；Redis 可浏览键值。也可以一键恢复示例业务库。"
          icon={<IconDatabase />}
          actions={
            <>
              <button type="button" className="btn btn-primary" onClick={ws.openCreate}>
                新建连接
              </button>
              <button type="button" className="btn btn-ghost" onClick={() => void ws.restoreSample()}>
                恢复示例库
              </button>
            </>
          }
        />
      ) : ws.filteredSchema.length === 0 ? (
        <EmptyState
          compact
          title="没有匹配的对象"
          body="试试更短的关键字，或清除搜索后从连接树继续浏览。"
          actions={
            <button type="button" className="btn btn-ghost" onClick={() => ws.setSearch('')}>
              清除搜索
            </button>
          }
        />
      ) : (
        <div className="tree" role="tree">
          {buckets.map((bucket) => {
            const groupKey = bucket.group?.id ?? 'ungrouped'
            const groupExpanded =
              ws.search.trim() || !bucket.group
                ? true
                : ws.expanded[`group:${bucket.group.id}`] !== false
            return (
              <div key={groupKey} className="conn-group">
                {bucket.group && (
                  <div className="conn-group-head" style={{ paddingLeft: 8 }}>
                    <button
                      type="button"
                      className={groupExpanded ? 'twist is-open' : 'twist'}
                      aria-label={groupExpanded ? '折叠分组' : '展开分组'}
                      onClick={() => ws.toggleExpanded(`group:${bucket.group!.id}`)}
                    >
                      <Caret />
                    </button>
                    {renamingGroupId === bucket.group.id ? (
                      <input
                        className="fav-input fav-rename"
                        value={renameDraft}
                        autoFocus
                        onChange={(e) => setRenameDraft(e.target.value)}
                        onBlur={() => {
                          const name = renameDraft.trim()
                          if (name) void ws.saveConnectionGroup({ id: bucket.group!.id, name })
                          setRenamingGroupId(null)
                        }}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            e.preventDefault()
                            const name = renameDraft.trim()
                            if (name) void ws.saveConnectionGroup({ id: bucket.group!.id, name })
                            setRenamingGroupId(null)
                          }
                          if (e.key === 'Escape') setRenamingGroupId(null)
                        }}
                      />
                    ) : (
                      <strong className="conn-group-title">{bucket.group.name}</strong>
                    )}
                    <span className="conn-group-count">{bucket.nodes.length}</span>
                    {renamingGroupId !== bucket.group.id && (
                      <div className="conn-group-actions">
                        <button
                          type="button"
                          className="tiny-btn btn"
                          onClick={() => {
                            setRenamingGroupId(bucket.group!.id)
                            setRenameDraft(bucket.group!.name)
                          }}
                        >
                          改名
                        </button>
                        <button
                          type="button"
                          className="tiny-btn btn"
                          onClick={() => {
                            if (
                              window.confirm(
                                `删除分组「${bucket.group!.name}」？连接会移到未分组。`,
                              )
                            ) {
                              void ws.removeConnectionGroup(bucket.group!.id)
                            }
                          }}
                        >
                          删组
                        </button>
                      </div>
                    )}
                  </div>
                )}
                {!bucket.group && ws.connectionGroups.length > 0 && bucket.nodes.length > 0 && (
                  <div className="conn-group-head is-muted" style={{ paddingLeft: 8 }}>
                    <strong className="conn-group-title">未分组</strong>
                    <span className="conn-group-count">{bucket.nodes.length}</span>
                  </div>
                )}
                {groupExpanded &&
                  bucket.nodes.map((node) => (
                    <TreeNode
                      key={node.id}
                      node={node}
                      depth={bucket.group || (ws.connectionGroups.length > 0 && !bucket.group) ? 1 : 0}
                      menuId={menuId}
                      onMenu={setMenuId}
                    />
                  ))}
              </div>
            )
          })}
        </div>
      )}
    </aside>
  )
}

function TreeNode({
  node,
  depth,
  menuId,
  onMenu,
}: {
  node: SchemaNode
  depth: number
  menuId: string | null
  onMenu: (id: string | null) => void
}) {
  const ws = useWorkspace()
  const expanded = isTreeNodeExpanded(node, ws.expanded, Boolean(ws.search.trim()))
  const hasChildren = (node.children?.length ?? 0) > 0
  const selected = ws.selectedId === node.id || (node.kind === 'connection' && ws.activeConnection?.id === node.id && !ws.selectedId)
  const connection = ws.connections.find((item) => item.id === node.id)
  const nodeConn = node.connectionId
    ? ws.connections.find((item) => item.id === node.connectionId)
    : undefined
  const dialect = node.dialect || nodeConn?.dialect || connection?.dialect
  const failed = node.status === 'error'
  const refreshingHere =
    ws.schemaRefreshing &&
    (node.kind === 'connection' || node.kind === 'database') &&
    (!!node.connectionId || node.kind === 'connection')
  const rowClass = [
    'tree-row',
    selected ? 'is-selected' : '',
    failed ? 'is-error' : '',
    refreshingHere ? 'is-refreshing' : '',
  ]
    .filter(Boolean)
    .join(' ')
  const insertable =
    (node.kind === 'table' && !!(node.tableName || node.name)) ||
    ((node.kind === 'column' || node.kind === 'key') && !!node.name)
  const insertName = () => {
    if (node.kind === 'table') {
      const dial = dialect || ws.activeConnection?.dialect || 'sqlite'
      const raw = node.tableName || node.name
      const text = qualifyBrowseTable(dial, raw, node.databaseName)
      emitDataai('dataai:insert-at-cursor', { text })
    } else if (node.kind === 'column' || node.kind === 'key') {
      ws.insertObjectIdent(node.name, dialect)
    }
  }

  const dragIdentText = () => {
    const dial = dialect || ws.activeConnection?.dialect || 'sqlite'
    if (node.kind === 'table') {
      const raw = node.tableName || node.name
      if (!raw?.trim()) return ''
      return qualifyBrowseTable(dial, raw.trim(), node.databaseName)
    }
    const raw = node.kind === 'column' || node.kind === 'key' ? node.name : ''
    if (!raw?.trim()) return ''
    return quoteIdentIfNeeded(raw.trim(), dial)
  }

  return (
    <div className="tree-branch">
      <div className={rowClass} style={{ paddingLeft: 8 + depth * 14 }} role="treeitem" aria-expanded={hasChildren ? expanded : undefined}>
        {hasChildren ? (
          <button
            type="button"
            className={expanded ? 'twist is-open' : 'twist'}
            aria-label={expanded ? '折叠' : '展开'}
            onClick={() => ws.toggleExpanded(node.id)}
          >
            <Caret />
          </button>
        ) : (
          <span className="twist-spacer" />
        )}
        <button
          type="button"
          className="tree-hit"
          draggable={insertable}
          onDragStart={(event) => {
            if (!insertable) {
              event.preventDefault()
              return
            }
            const text = dragIdentText()
            if (!text) {
              event.preventDefault()
              return
            }
            setSqlDragData(event.dataTransfer, text, 'object')
          }}
          onClick={(event) => {
            if (insertable && (event.altKey || event.ctrlKey || event.metaKey)) {
              event.preventDefault()
              insertName()
              return
            }
            ws.selectNode(node)
          }}
          onDoubleClick={() => {
            if (node.kind === 'table' && node.connectionId && node.tableName) {
              ws.openTableStructure(node.connectionId, node.tableName)
            }
          }}
          title={
            node.kind === 'table'
              ? '单击打开查询 · 双击查看结构 · Alt/Ctrl+单击插入 · 可拖到编辑器'
              : insertable
                ? 'Alt/Ctrl+单击插入名称 · 可拖到编辑器'
                : undefined
          }
        >
          {node.kind === 'connection' && connection?.colorTag && colorForTag(connection.colorTag) && (
            <span
              className="conn-color-dot"
              style={{ background: colorForTag(connection.colorTag)! }}
              title="颜色标记"
            />
          )}
          <span className="tree-icon">
            {node.kind === 'table' ? <IconTable /> : node.kind === 'column' ? <IconColumn /> : node.kind === 'key' ? <IconColumn /> : <IconDatabase />}
          </span>
          <span className="tree-label">{node.displayName}</span>
          {refreshingHere && <span className="tree-refresh-spin" aria-hidden="true" />}
          {node.kind === 'table' && node.displayName !== node.name && <span className="tree-meta">{node.name}</span>}
          {node.kind === 'column' && node.dataType && <span className="col-type">{node.dataType}</span>}
          {node.kind === 'key' && node.dataType && <span className="col-type">{node.dataType}</span>}
          {node.kind === 'connection' && node.dialect && <DialectBadge dialect={node.dialect} />}
          {node.kind === 'connection' && node.connectionId && (
            <HealthBadge health={ws.healthById[node.connectionId]} />
          )}
        </button>
        {node.kind === 'connection' && connection && (
          <button
            type="button"
            className="icon-btn tiny"
            aria-label={`${node.displayName}的操作`}
            aria-expanded={menuId === node.id}
            onClick={() => onMenu(menuId === node.id ? null : node.id)}
          >
            <IconMore />
          </button>
        )}
        {node.kind === 'database' && node.connectionId && (
          <button
            type="button"
            className="icon-btn tiny"
            aria-label={`${node.displayName}的操作`}
            aria-expanded={menuId === node.id}
            onClick={() => onMenu(menuId === node.id ? null : node.id)}
          >
            <IconMore />
          </button>
        )}
        {node.kind === 'table' && node.connectionId && node.tableName && (
          <button
            type="button"
            className="icon-btn tiny"
            aria-label={`${node.displayName}的操作`}
            aria-expanded={menuId === node.id}
            onClick={() => onMenu(menuId === node.id ? null : node.id)}
          >
            <IconMore />
          </button>
        )}
        {(node.kind === 'column' || node.kind === 'key') && (
          <button
            type="button"
            className="icon-btn tiny"
            aria-label={`${node.displayName}的操作`}
            aria-expanded={menuId === node.id}
            onClick={() => onMenu(menuId === node.id ? null : node.id)}
          >
            <IconMore />
          </button>
        )}
        {menuId === node.id && connection && (
          <div className="menu" role="menu">
            <button
              type="button"
              role="menuitem"
              disabled={ws.schemaRefreshing}
              onClick={() => {
                onMenu(null)
                void ws.refreshSchemaTree(connection.id)
              }}
            >
              刷新
            </button>
            <button
              type="button"
              role="menuitem"
              onClick={() => {
                onMenu(null)
                void ws.checkConnectionHealth(connection.id, false)
              }}
            >
              检测延迟
            </button>
            {connection.dialect !== 'sqlite' && connection.dialect !== 'redis' && (
              <button
                type="button"
                role="menuitem"
                onClick={() => {
                  onMenu(null)
                  ws.openDbVisibility(connection)
                }}
              >
                显示的库…
              </button>
            )}
            <button type="button" role="menuitem" onClick={() => { onMenu(null); ws.openEdit(connection) }}>
              编辑
            </button>
            <div className="menu-color-row" role="group" aria-label="颜色标记" onMouseDown={(event) => event.stopPropagation()}>
              <span className="menu-color-label">颜色</span>
              <button
                type="button"
                className={!connection.colorTag ? 'conn-color-swatch is-none is-active' : 'conn-color-swatch is-none'}
                title="无标记"
                aria-label="无颜色标记"
                onClick={() => {
                  onMenu(null)
                  void ws.setConnectionColorTag(connection.id, null)
                }}
              />
              {CONN_COLOR_TAGS.map((tag) => (
                <button
                  key={tag.id}
                  type="button"
                  className={connection.colorTag === tag.id ? 'conn-color-swatch is-active' : 'conn-color-swatch'}
                  style={{ background: tag.color }}
                  title={tag.label}
                  aria-label={tag.label}
                  onClick={() => {
                    onMenu(null)
                    void ws.setConnectionColorTag(connection.id, tag.id)
                  }}
                />
              ))}
            </div>
            <button type="button" role="menuitem" className="danger" onClick={() => { onMenu(null); ws.askDelete(connection) }}>
              删除
            </button>
          </div>
        )}
        {menuId === node.id && node.kind === 'database' && node.connectionId && (
          <div className="menu" role="menu">
            <button
              type="button"
              role="menuitem"
              disabled={ws.schemaRefreshing}
              onClick={() => {
                onMenu(null)
                void ws.refreshSchemaTree(node.connectionId)
              }}
            >
              刷新
            </button>
          </div>
        )}
        {menuId === node.id && node.kind === 'table' && node.connectionId && node.tableName && (
          <div className="menu" role="menu">
            <button
              type="button"
              role="menuitem"
              disabled={ws.schemaRefreshing}
              onClick={() => {
                onMenu(null)
                void ws.refreshSchemaTree(node.connectionId)
              }}
            >
              刷新
            </button>
            <button
              type="button"
              role="menuitem"
              onClick={() => {
                onMenu(null)
                insertName()
              }}
            >
              插入表名
            </button>
            <button
              type="button"
              role="menuitem"
              onClick={() => {
                onMenu(null)
                ws.openTableStructure(node.connectionId!, node.tableName!)
              }}
            >
              查看结构
            </button>
            <button
              type="button"
              role="menuitem"
              onClick={() => {
                onMenu(null)
                ws.openTableQuery(node.connectionId!, node.tableName!, node.databaseName)
              }}
            >
              打开查询
            </button>
            <button
              type="button"
              role="menuitem"
              onClick={() => {
                onMenu(null)
                ws.openImportWizard({ connectionId: node.connectionId!, tableName: node.tableName! })
              }}
            >
              导入 CSV/Excel
            </button>
          </div>
        )}
        {menuId === node.id && (node.kind === 'column' || node.kind === 'key') && (
          <div className="menu" role="menu">
            <button
              type="button"
              role="menuitem"
              onClick={() => {
                onMenu(null)
                insertName()
              }}
            >
              插入列名
            </button>
          </div>
        )}
      </div>
      {node.note && node.name !== 'connect-error' && <p className="tree-note">{node.note}</p>}
      {expanded &&
        node.children?.map((child) =>
          child.kind === 'note' && child.name === 'connect-error' ? (
            <div key={child.id} className="connect-error" role="alert">
              <strong>{child.displayName}</strong>
              <p>{child.note}</p>
            </div>
          ) : (
            <TreeNode key={child.id} node={child} depth={depth + 1} menuId={menuId} onMenu={onMenu} />
          ),
        )}
    </div>
  )
}

function HealthBadge({ health }: { health?: import('@shared/connHealth').ConnHealth }) {
  if (!health) return null
  if (health.unsupported) {
    return (
      <span className="health-badge is-unsupported" title={health.error ?? '暂不支持探测'}>
        —
      </span>
    )
  }
  const label = health.ok ? formatLatency(health.latencyMs) : '失败'
  const title = health.ok
    ? `延迟 ${health.latencyMs} ms · ${new Date(health.checkedAt).toLocaleTimeString()}`
    : health.error ?? '探测失败'
  return (
    <span className={`health-badge is-${health.tone}`} title={title}>
      {label}
    </span>
  )
}

function DialectBadge({ dialect }: { dialect: Dialect }) {
  const info = dialectInfo(dialect)
  const pending = info.executable || info.kv ? '' : ' badge-pending'
  return <span className={`badge badge-${dialect}${pending}`}>{info.label}</span>
}

function Caret() {
  return (
    <svg width="12" height="12" viewBox="0 0 16 16" aria-hidden="true">
      <path d="M6 4.5 10.5 8 6 11.5" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}
