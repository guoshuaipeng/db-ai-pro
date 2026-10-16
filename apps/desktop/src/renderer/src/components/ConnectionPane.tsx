import { useEffect, useRef, useState } from 'react'
import { dialectInfo } from '@shared/types'
import type { SchemaNode } from '@shared/types'
import { IconDatabase, IconMore, IconPlus, IconSearch, IconTable } from './icons'
import { useWorkspace } from '../state/workspace'

export function ConnectionPane() {
  const ws = useWorkspace()
  const [menuId, setMenuId] = useState<string | null>(null)
  const root = useRef<HTMLElement>(null)

  useEffect(() => {
    const close = (event: MouseEvent) => {
      if (!root.current?.contains(event.target as Node)) setMenuId(null)
    }
    window.addEventListener('mousedown', close)
    return () => window.removeEventListener('mousedown', close)
  }, [])

  return (
    <aside className="sidebar" ref={root} aria-label="连接">
      <div className="side-head">
        <h1>连接</h1>
        <button type="button" className="icon-btn" aria-label="新建连接" onClick={ws.openCreate}>
          <IconPlus />
        </button>
      </div>
      <label className="search">
        <IconSearch />
        <input
          value={ws.search}
          onChange={(event) => ws.setSearch(event.target.value)}
          placeholder="搜索连接或对象"
          aria-label="搜索连接或对象"
        />
      </label>
      {ws.connections.length === 0 ? (
        <div className="empty">
          <IconDatabase />
          <p className="empty-title">还没有连接</p>
          <p className="empty-copy">添加 SQLite 文件即可浏览对象并查询。其他数据库可以先保存。</p>
          <button type="button" className="btn btn-primary" onClick={ws.openCreate}>
            新建连接
          </button>
          <button type="button" className="btn btn-ghost" onClick={() => void ws.restoreSample()}>
            恢复示例库
          </button>
        </div>
      ) : ws.filteredSchema.length === 0 ? (
        <div className="empty">
          <p className="empty-title">没有匹配的对象</p>
          <button type="button" className="btn btn-ghost" onClick={() => ws.setSearch('')}>
            清除搜索
          </button>
        </div>
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

  return (
    <div className="tree-branch">
      <div className={selected ? 'tree-row is-selected' : 'tree-row'} style={{ paddingLeft: 8 + depth * 14 }} role="treeitem" aria-expanded={hasChildren ? expanded : undefined}>
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
        <button type="button" className="tree-hit" onClick={() => ws.selectNode(node)}>
          <span className="tree-icon">{node.kind === 'table' ? <IconTable /> : <IconDatabase />}</span>
          <span className="tree-label">{node.displayName}</span>
          {node.kind === 'table' && node.displayName !== node.name && <span className="tree-meta">{node.name}</span>}
          {node.kind === 'connection' && node.dialect && <span className="tree-meta">{dialectInfo(node.dialect).label}</span>}
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
      </div>
      {node.note && <p className="tree-note">{node.note}</p>}
      {expanded &&
        node.children?.map((child) => (
          <TreeNode key={child.id} node={child} depth={depth + 1} menuId={menuId} onMenu={onMenu} />
        ))}
    </div>
  )
}

function Caret() {
  return (
    <svg width="12" height="12" viewBox="0 0 16 16" aria-hidden="true">
      <path d="M6 4.5 10.5 8 6 11.5" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}
