import { useEffect, useMemo, useRef, useState, type MouseEvent as ReactMouseEvent } from 'react'
import { emitDataai, onDataai } from '../appEvents'
import { dialectInfo } from '@shared/types'
import { formatLatency } from '@shared/connHealth'
import {
  healthBadgeFailLabel,
  healthBadgeIdleLabel,
  healthBadgeIdleTitle,
  healthBadgeTitle,
  healthBadgeUnsupportedLabel,
  healthProbeMenuLabel,
  healthProbeMenuTitle,
} from '@shared/connHealthUi'
import {
  connColorClearAria,
  connColorClearTitle,
  connColorGroupAria,
  connColorGroupLabel,
  connColorTagAria,
  connColorTagTitle,
} from '@shared/connColorUi'
import {
  sampleDbEmptyActionLabel,
  sampleDbEmptyActionTitle,
  sampleDbEmptyBody,
  sampleDbEmptyTitle,
} from '@shared/sampleDbUi'
import {
  duplicateConnectionMenuLabel,
  duplicateConnectionMenuTitle,
} from '@shared/duplicateConnectionUi'
import { bucketSchemaByGroup, colorForTag, CONN_COLOR_TAGS } from '@shared/connGroups'
import { quoteIdentIfNeeded } from '@shared/sql'
import { countOpenExpands, isTreeNodeExpanded } from '@shared/schemaTreeRefresh'
import {
  expandPersistHint,
  expandPersistStatus,
} from '@shared/treeExpandPersistUi'
import { qualifyBrowseTable } from '@shared/tablePaging'
import {
  treeColumnCopyText,
  treeDatabaseCopyText,
  treeIdentCopiedToast,
  treeTableCopyText,
} from '@shared/treeIdentCopy'
import { setSqlDragData } from '@shared/sqlDragDrop'
import type { Dialect, SchemaNode } from '@shared/types'
import { IconCollapseTree, IconColumn, IconDatabase, IconExpandLevel, IconExport, IconImport, IconMore, IconPlus, IconRefresh, IconSearch, IconTable } from './icons'
import { EmptyState } from './EmptyState'
import { useWorkspace } from '../state/workspace'
import {
  collectMatchedTables,
  countTreeNodes,
  formatMatchedTablesClipboard,
  narrowTreeByKind,
  treeMatchedTablesCopiedToast,
  treeSearchKindEmptyBody,
  type TreeSearchKind,
} from '@shared/tree'

export function ConnectionPane() {
  const ws = useWorkspace()
  const [menuId, setMenuId] = useState<string | null>(null)
  const [groupDraft, setGroupDraft] = useState('')
  const [creatingGroup, setCreatingGroup] = useState(false)
  const [chromeMenuOpen, setChromeMenuOpen] = useState(false)
  const [renamingGroupId, setRenamingGroupId] = useState<string | null>(null)
  const [renameDraft, setRenameDraft] = useState('')
  const root = useRef<HTMLElement>(null)

  const searchRef = useRef<HTMLInputElement>(null)
  const groupInputRef = useRef<HTMLInputElement>(null)
  const [searchKind, setSearchKind] = useState<TreeSearchKind>('all')

  const displaySchema = useMemo(() => {
    if (!ws.search.trim()) return ws.filteredSchema
    return narrowTreeByKind(ws.filteredSchema, searchKind)
  }, [ws.filteredSchema, ws.search, searchKind])

  const displayStats = useMemo(() => countTreeNodes(displaySchema), [displaySchema])
  const expandOpenCount = useMemo(() => countOpenExpands(ws.expanded), [ws.expanded])

  const matchedTables = useMemo(() => collectMatchedTables(displaySchema), [displaySchema])

  const buckets = useMemo(
    () => bucketSchemaByGroup(displaySchema, ws.connections, ws.connectionGroups),
    [displaySchema, ws.connections, ws.connectionGroups],
  )

  useEffect(() => {
    if (!ws.search.trim()) setSearchKind('all')
  }, [ws.search])

  useEffect(() => {
    const close = (event: globalThis.MouseEvent) => {
      if (!root.current?.contains(event.target as Node)) {
        setMenuId(null)
        setChromeMenuOpen(false)
      }
    }
    window.addEventListener('mousedown', close)
    return () => window.removeEventListener('mousedown', close)
  }, [])

  useEffect(() => {
    if (!creatingGroup) return
    window.setTimeout(() => {
      groupInputRef.current?.focus()
      groupInputRef.current?.select()
    }, 0)
  }, [creatingGroup])

  useEffect(() => onDataai('dataai:focus-tree-search', () => {
    if (!ws.sidebarOpen) ws.toggleSidebar()
    window.setTimeout(() => {
      searchRef.current?.focus()
      searchRef.current?.select()
    }, 0)
  }), [ws])

  useEffect(
    () =>
      onDataai('dataai:reveal-connection', (detail) => {
        const id = detail?.connectionId
        if (!id || !root.current) return
        window.requestAnimationFrame(() => {
          const el = root.current?.querySelector(`[data-tree-node-id="${CSS.escape(id)}"]`)
          el?.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
        })
      }),
    [],
  )

  useEffect(
    () =>
      onDataai('dataai:reveal-tree-node', (detail) => {
        const id = detail?.nodeId
        if (!id || !root.current) return
        window.requestAnimationFrame(() => {
          const el = root.current?.querySelector(`[data-tree-node-id="${CSS.escape(id)}"]`)
          el?.scrollIntoView({ block: 'center', behavior: 'smooth' })
        })
      }),
    [],
  )

  return (
    <aside className="sidebar" ref={root} aria-label="连接">
      <div className="side-head">
        <h1>连接</h1>
        <div className="side-head-actions">
          <button
            type="button"
            className="btn btn-primary tiny-btn btn-new-conn"
            aria-label="新建连接"
            title="新建数据库连接"
            onClick={ws.openCreate}
          >
            <IconPlus />
            新建连接
          </button>
        </div>
      </div>

      <label className="search">
        <IconSearch />
        <input
          ref={searchRef}
          value={ws.search}
          onChange={(event) => ws.setSearch(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Escape' && ws.search.trim()) {
              event.preventDefault()
              event.stopPropagation()
              ws.setSearch('')
              setSearchKind('all')
            }
          }}
          placeholder="搜索主机 / 库 / 表 / 列"
          aria-label="搜索主机、数据库、表或列"
        />
        {ws.search.trim() && (
          <button type="button" className="search-clear" aria-label="清除搜索" onClick={() => { ws.setSearch(''); setSearchKind('all') }}>
            ×
          </button>
        )}
      </label>

      <div className="conn-chrome-tools" role="toolbar" aria-label="连接操作">
        <button
          type="button"
          className="icon-btn"
          aria-label="导入连接"
          title="导入连接"
          onClick={() => void ws.importConnections()}
        >
          <IconImport />
        </button>
        <button
          type="button"
          className="icon-btn"
          aria-label="导出连接"
          title="导出连接"
          onClick={() => void ws.exportConnections()}
        >
          <IconExport />
        </button>
        <button
          type="button"
          className="icon-btn"
          aria-label="展开下一级"
          title="展开当前已打开节点的下一级（可多次点击）"
          onClick={() => ws.expandObjectTreeOneLevel()}
        >
          <IconExpandLevel />
        </button>
        <button
          type="button"
          className="icon-btn"
          aria-label="折叠对象树"
          title="折叠全部（保留连接根展开；有搜索时一并清除）"
          onClick={() => ws.collapseObjectTree()}
        >
          <IconCollapseTree />
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
        <div className="conn-chrome-more">
          <button
            type="button"
            className="icon-btn"
            aria-label="更多"
            aria-expanded={chromeMenuOpen}
            title="更多"
            onClick={() => setChromeMenuOpen((open) => !open)}
          >
            <IconMore />
          </button>
          {chromeMenuOpen ? (
            <div className="menu conn-chrome-menu" role="menu">
              <button
                type="button"
                role="menuitem"
                onClick={() => {
                  setChromeMenuOpen(false)
                  setCreatingGroup(true)
                }}
              >
                新建分组
              </button>
              <p className="conn-chrome-menu-hint" title={expandPersistHint()} role="status">
                {expandPersistStatus(expandOpenCount)}
              </p>
            </div>
          ) : null}
        </div>
      </div>

      {ws.search.trim() ? (
        <div className="tree-search-toolbar">
          <div className="tree-search-kinds" role="tablist" aria-label="搜索结果类型">
            {(
              [
                { id: 'all' as const, label: '全部' },
                { id: 'table' as const, label: '表' },
                { id: 'column' as const, label: '列' },
              ] as const
            ).map((item) => (
              <button
                key={item.id}
                type="button"
                role="tab"
                aria-selected={searchKind === item.id}
                className={searchKind === item.id ? 'tree-search-kind is-active' : 'tree-search-kind'}
                onClick={() => setSearchKind(item.id)}
              >
                {item.label}
              </button>
            ))}
          </div>
          {displaySchema.length > 0 ? (
            <div className="search-stats-row">
              <p className="search-stats">
                {displayStats.connections} 连接 · {displayStats.tables} 表 · {displayStats.columns} 列
              </p>
              <button
                type="button"
                className="btn btn-ghost tiny-btn"
                disabled={matchedTables.length === 0}
                title="复制当前结果中的表名列表"
                onClick={() => {
                  const text = formatMatchedTablesClipboard(matchedTables)
                  if (!text) {
                    ws.pushToast('info', treeMatchedTablesCopiedToast(0))
                    return
                  }
                  void navigator.clipboard.writeText(text).then(
                    () => ws.pushToast('success', treeMatchedTablesCopiedToast(matchedTables.length)),
                    () => ws.pushToast('error', '复制失败'),
                  )
                }}
              >
                复制表名
              </button>
            </div>
          ) : null}
        </div>
      ) : null}

      {/* Bugfix: 侧栏最近区块已移除 */}
      {creatingGroup ? (
        <div className="conn-group-bar">
          <input
            ref={groupInputRef}
            className="fav-input"
            value={groupDraft}
            onChange={(e) => setGroupDraft(e.target.value)}
            placeholder="新建连接分组"
            aria-label="新建连接分组"
            onKeyDown={(e) => {
              if (e.key === 'Escape') {
                e.preventDefault()
                setCreatingGroup(false)
                setGroupDraft('')
                return
              }
              if (e.key === 'Enter') {
                e.preventDefault()
                const name = groupDraft.trim()
                if (!name) return
                void ws.saveConnectionGroup({ name }).then(() => {
                  setGroupDraft('')
                  setCreatingGroup(false)
                })
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
              void ws.saveConnectionGroup({ name }).then(() => {
                setGroupDraft('')
                setCreatingGroup(false)
              })
            }}
          >
            新建分组
          </button>
          <button
            type="button"
            className="btn btn-ghost tiny-btn"
            aria-label="取消新建分组"
            onClick={() => {
              setCreatingGroup(false)
              setGroupDraft('')
            }}
          >
            取消
          </button>
        </div>
      ) : null}

      {ws.connections.length === 0 ? (
        <EmptyState
          kicker="开始使用"
          title={sampleDbEmptyTitle()}
          body={sampleDbEmptyBody()}
          icon={<IconDatabase />}
          actions={
            <>
              <button type="button" className="btn btn-primary" onClick={ws.openCreate}>
                新建连接
              </button>
              <button
                type="button"
                className="btn btn-ghost"
                title={sampleDbEmptyActionTitle()}
                onClick={() => void ws.restoreSample()}
              >
                {sampleDbEmptyActionLabel()}
              </button>
            </>
          }
        />
      ) : displaySchema.length === 0 ? (
        <EmptyState
          compact
          title={ws.filteredSchema.length > 0 ? '当前类型下没有匹配' : '没有匹配的对象'}
          body={treeSearchKindEmptyBody(ws.filteredSchema.length > 0 ? searchKind : 'all')}
          actions={
            <>
              {ws.filteredSchema.length > 0 && searchKind !== 'all' ? (
                <button type="button" className="btn btn-ghost" onClick={() => setSearchKind('all')}>
                  查看全部类型
                </button>
              ) : null}
              <button
                type="button"
                className="btn btn-ghost"
                onClick={() => {
                  ws.setSearch('')
                  setSearchKind('all')
                }}
              >
                清除搜索
              </button>
            </>
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
  const tableKey = node.kind === 'table' ? (node.tableName || node.name || '').trim() : ''
  const canTableMenu = node.kind === 'table' && !!node.connectionId && !!tableKey
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

  const copyName = async () => {
    const dial = dialect || ws.activeConnection?.dialect || 'sqlite'
    let text = ''
    if (node.kind === 'table') {
      text = treeTableCopyText(dial, node.tableName || node.name, node.databaseName)
    } else if (node.kind === 'column' || node.kind === 'key') {
      text = treeColumnCopyText(dial, node.name)
    } else if (node.kind === 'database') {
      text = treeDatabaseCopyText(dial, node.name)
    }
    if (!text) {
      ws.pushToast('info', '没有可复制的名称')
      return
    }
    try {
      await navigator.clipboard.writeText(text)
      ws.pushToast('success', treeIdentCopiedToast(text))
    } catch (error) {
      ws.pushToast('error', error instanceof Error ? error.message : '复制失败')
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
      <div
        className={rowClass}
        data-tree-node-id={node.id}
        style={{ paddingLeft: 8 + depth * 14 }}
        role="treeitem"
        aria-expanded={hasChildren ? expanded : undefined}
        onContextMenu={(event) => {
          event.preventDefault()
          event.stopPropagation()
          if (
            node.kind === 'connection' ||
            node.kind === 'database' ||
            node.kind === 'table' ||
            node.kind === 'column' ||
            node.kind === 'key'
          ) {
            onMenu(menuId === node.id ? null : node.id)
          }
        }}
      >
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
            if (node.kind === 'table' && node.connectionId && tableKey) {
              ws.openTableQuery(node.connectionId, tableKey, node.databaseName)
            }
          }}
          title={
            node.kind === 'table'
              ? '单击/双击打开查询 · 右键查看表结构 · Alt/Ctrl+单击插入 · 可拖到编辑器'
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
            <HealthBadge
              connectionId={node.connectionId}
              health={ws.healthById[node.connectionId]}
            />
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
        {canTableMenu && (
          <button
            type="button"
            className="icon-btn tiny"
            aria-label={`${node.displayName}的操作`}
            aria-expanded={menuId === node.id}
            onClick={(event) => {
              event.stopPropagation()
              onMenu(menuId === node.id ? null : node.id)
            }}
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
              title={healthProbeMenuTitle()}
              onClick={() => {
                onMenu(null)
                void ws.checkConnectionHealth(connection.id, false)
              }}
            >
              {healthProbeMenuLabel()}
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
            <button
              type="button"
              role="menuitem"
              title={duplicateConnectionMenuTitle()}
              onClick={() => {
                onMenu(null)
                void ws.duplicateConnection(connection.id)
              }}
            >
              {duplicateConnectionMenuLabel()}
            </button>
            <button
              type="button"
              role="menuitem"
              onClick={() => {
                onMenu(null)
                void ws.copyConnectionEndpoint(connection.id)
              }}
            >
              复制地址
            </button>
            <button type="button" role="menuitem" onClick={() => { onMenu(null); ws.openEdit(connection) }}>
              编辑
            </button>
            <div className="menu-color-row" role="group" aria-label={connColorGroupAria()} onMouseDown={(event) => event.stopPropagation()}>
              <span className="menu-color-label">{connColorGroupLabel()}</span>
              <button
                type="button"
                className={!connection.colorTag ? 'conn-color-swatch is-none is-active' : 'conn-color-swatch is-none'}
                title={connColorClearTitle()}
                aria-label={connColorClearAria()}
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
                  title={connColorTagTitle(tag.id)}
                  aria-label={connColorTagAria(tag.id)}
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
            <button
              type="button"
              role="menuitem"
              onClick={() => {
                onMenu(null)
                void copyName()
              }}
            >
              复制库名
            </button>
          </div>
        )}
        {menuId === node.id && canTableMenu && (
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
                void copyName()
              }}
            >
              复制表名
            </button>
            <button
              type="button"
              role="menuitem"
              onClick={() => {
                onMenu(null)
                ws.openTableQuery(node.connectionId!, tableKey, node.databaseName)
              }}
            >
              打开查询
            </button>
            <button
              type="button"
              role="menuitem"
              onClick={() => {
                onMenu(null)
                ws.openTableStructure(node.connectionId!, tableKey, node.databaseName)
              }}
            >
              表结构
            </button>
            <button
              type="button"
              role="menuitem"
              onClick={() => {
                onMenu(null)
                ws.openImportWizard({ connectionId: node.connectionId!, tableName: tableKey })
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
            <button
              type="button"
              role="menuitem"
              onClick={() => {
                onMenu(null)
                void copyName()
              }}
            >
              复制列名
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

function HealthBadge({
  connectionId,
  health,
}: {
  connectionId: string
  health?: import('@shared/connHealth').ConnHealth
}) {
  const ws = useWorkspace()
  const [busy, setBusy] = useState(false)
  const probe = (event: ReactMouseEvent) => {
    event.preventDefault()
    event.stopPropagation()
    if (busy) return
    setBusy(true)
    void ws.checkConnectionHealth(connectionId, false).finally(() => setBusy(false))
  }
  if (!health) {
    return (
      <button
        type="button"
        className="health-badge is-idle"
        title={healthBadgeIdleTitle()}
        aria-label={healthBadgeIdleTitle()}
        disabled={busy}
        onClick={probe}
        onMouseDown={(event) => event.stopPropagation()}
      >
        {busy ? '…' : healthBadgeIdleLabel()}
      </button>
    )
  }
  if (health.unsupported) {
    return (
      <button
        type="button"
        className="health-badge is-unsupported"
        title={healthBadgeTitle(health)}
        aria-label={healthBadgeTitle(health)}
        disabled={busy}
        onClick={probe}
        onMouseDown={(event) => event.stopPropagation()}
      >
        {busy ? '…' : healthBadgeUnsupportedLabel()}
      </button>
    )
  }
  const label = health.ok ? formatLatency(health.latencyMs) : healthBadgeFailLabel()
  return (
    <button
      type="button"
      className={`health-badge is-${health.tone}`}
      title={healthBadgeTitle(health)}
      aria-label={healthBadgeTitle(health)}
      disabled={busy}
      onClick={probe}
      onMouseDown={(event) => event.stopPropagation()}
    >
      {busy ? '…' : label}
    </button>
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
