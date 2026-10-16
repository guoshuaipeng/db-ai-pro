import { useEffect, useRef, useState } from 'react'
import { onDataai } from '../appEvents'
import { dialectInfo } from '@shared/types'
import type { Dialect, SchemaNode } from '@shared/types'
import { IconColumn, IconDatabase, IconMore, IconPlus, IconSearch, IconTable } from './icons'
import { EmptyState } from './EmptyState'
import { useWorkspace } from '../state/workspace'

export function ConnectionPane() {
  const ws = useWorkspace()
  const [menuId, setMenuId] = useState<string | null>(null)
  const root = useRef<HTMLElement>(null)
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
          {ws.filteredSchema.map((node) => (
            <TreeNode
              key={node.id}
              node={node}
              depth={0}
              menuId={menuId}
              onMenu={setMenuId}
            />
          ))}
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
  const expanded = ws.search.trim() ? true : ws.expanded[node.id] !== false
  const hasChildren = (node.children?.length ?? 0) > 0
  const selected = ws.selectedId === node.id || (node.kind === 'connection' && ws.activeConnection?.id === node.id && !ws.selectedId)
  const connection = ws.connections.find((item) => item.id === node.id)
  const failed = node.status === 'error'
  const rowClass = ['tree-row', selected ? 'is-selected' : '', failed ? 'is-error' : ''].filter(Boolean).join(' ')

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
          onClick={() => ws.selectNode(node)}
          onDoubleClick={() => {
            if (node.kind === 'table' && node.connectionId && node.tableName) {
              ws.openTableStructure(node.connectionId, node.tableName)
            }
          }}
          title={node.kind === 'table' ? '单击打开查询 · 双击查看结构' : undefined}
        >
          <span className="tree-icon">
            {node.kind === 'table' ? <IconTable /> : node.kind === 'column' ? <IconColumn /> : node.kind === 'key' ? <IconColumn /> : <IconDatabase />}
          </span>
          <span className="tree-label">{node.displayName}</span>
          {node.kind === 'table' && node.displayName !== node.name && <span className="tree-meta">{node.name}</span>}
          {node.kind === 'column' && node.dataType && <span className="col-type">{node.dataType}</span>}
          {node.kind === 'key' && node.dataType && <span className="col-type">{node.dataType}</span>}
          {node.kind === 'connection' && node.dialect && <DialectBadge dialect={node.dialect} />}
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
        {menuId === node.id && connection && (
          <div className="menu" role="menu">
            <button type="button" role="menuitem" onClick={() => { onMenu(null); ws.openEdit(connection) }}>
              编辑
            </button>
            <button type="button" role="menuitem" className="danger" onClick={() => { onMenu(null); ws.askDelete(connection) }}>
              删除
            </button>
          </div>
        )}
        {menuId === node.id && node.kind === 'table' && node.connectionId && node.tableName && (
          <div className="menu" role="menu">
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
                ws.openTableQuery(node.connectionId!, node.tableName!)
              }}
            >
              打开查询
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
