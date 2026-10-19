/** Helpers for refreshing the connection/object tree while preserving expand state. */

import type { SchemaNode } from './types'

/** Cap persisted expand map size (open folders only). */
export const EXPANDED_KEY_CAP = 2_000

/**
 * Normalize a persisted expand map.
 * Only **true** entries are kept — false keys used to fill the 2000 cap and drop real opens.
 */
export function normalizeExpanded(raw: unknown): Record<string, boolean> {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {}
  const next: Record<string, boolean> = {}
  for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
    if (typeof key !== 'string' || !key.trim()) continue
    if (value !== true) continue
    next[key] = true
    if (Object.keys(next).length >= EXPANDED_KEY_CAP) break
  }
  return next
}

/** Drop non-true keys (in-memory compact before save). */
export function compactExpanded(
  expanded: Record<string, boolean> | null | undefined,
): Record<string, boolean> {
  return normalizeExpanded(expanded ?? {})
}

/** Count keys marked open (true) in a persisted expand map. */
export function countOpenExpands(expanded: Record<string, boolean> | null | undefined): number {
  if (!expanded) return 0
  let n = 0
  for (const value of Object.values(expanded)) {
    if (value === true) n += 1
  }
  return n
}

/**
 * Whether a tree node should render expanded.
 * Search forces expand. Only explicit `true` opens a node — no implicit "all connections open".
 */
export function isTreeNodeExpanded(
  node: Pick<SchemaNode, 'id' | 'kind'>,
  expanded: Record<string, boolean>,
  searching: boolean,
): boolean {
  if (searching) return true
  return expanded[node.id] === true
}

/**
 * After schema refresh: keep open flags that still exist; never invent false keys.
 */
export function seedExpanded(
  nodes: SchemaNode[],
  current: Record<string, boolean> = {},
): Record<string, boolean> {
  const ids = collectNodeIds(nodes)
  const next: Record<string, boolean> = {}
  for (const [key, value] of Object.entries(current)) {
    if (value === true && ids.has(key)) {
      next[key] = true
      if (Object.keys(next).length >= EXPANDED_KEY_CAP) break
    }
  }
  return next
}

/**
 * Cold start / empty memory: open only the last active connection so its DB list shows;
 * databases and tables stay collapsed.
 */
export function defaultExpandForActiveConnection(
  schema: SchemaNode[],
  activeConnectionId: string | null | undefined,
): Record<string, boolean> {
  const id = activeConnectionId?.trim()
  if (!id) return {}
  const root =
    schema.find((node) => node.id === id) ??
    schema.find((node) => node.connectionId === id && node.kind === 'connection')
  if (root) return { [root.id]: true }
  return { [id]: true }
}

/** Path from forest root to node (inclusive), or null. */
export function findNodePath(
  nodes: SchemaNode[],
  nodeId: string,
  trail: SchemaNode[] = [],
): SchemaNode[] | null {
  for (const node of nodes) {
    const next = [...trail, node]
    if (node.id === nodeId) return next
    const child = findNodePath(node.children ?? [], nodeId, next)
    if (child) return child
  }
  return null
}

/** Ensure ancestors of a node are expanded so it can be scrolled into view. */
export function expandAncestorsOf(
  schema: SchemaNode[],
  nodeId: string,
  current: Record<string, boolean> = {},
): Record<string, boolean> {
  const path = findNodePath(schema, nodeId)
  if (!path || path.length === 0) return compactExpanded(current)
  const next = { ...compactExpanded(current) }
  for (let i = 0; i < path.length - 1; i++) {
    next[path[i].id] = true
  }
  return compactExpanded(next)
}

/** Replace one connection root in the schema forest. */
export function replaceConnectionNode(
  schema: SchemaNode[],
  connectionId: string,
  nextNode: SchemaNode,
): SchemaNode[] {
  const idx = schema.findIndex((node) => node.id === connectionId || node.connectionId === connectionId)
  if (idx < 0) return [...schema, nextNode]
  const copy = schema.slice()
  copy[idx] = nextNode
  return copy
}

/** Collect node ids under a subtree (for optional pruning of stale expand keys). */
export function collectNodeIds(nodes: SchemaNode[]): Set<string> {
  const ids = new Set<string>()
  const walk = (node: SchemaNode) => {
    ids.add(node.id)
    node.children?.forEach(walk)
  }
  nodes.forEach(walk)
  return ids
}

/**
 * Collapse all folders: connection roots stay open; databases / tables / etc. close.
 * Only true keys are stored (connection ids).
 */
export function collapseSchemaTreeExpanded(schema: SchemaNode[]): Record<string, boolean> {
  const next: Record<string, boolean> = {}
  for (const node of schema) {
    if (node.kind === 'connection') next[node.id] = true
  }
  return next
}

export function collapseSchemaTreeToast(clearedSearch: boolean): string {
  return clearedSearch ? '已折叠对象树并清除搜索' : '已折叠对象树'
}

/**
 * Expand one level under every currently expanded node (search treated as fully expanded).
 * Repeated calls progressively reveal databases → tables → columns.
 */
export function expandSchemaTreeOneLevel(
  schema: SchemaNode[],
  current: Record<string, boolean>,
  searching: boolean,
): { next: Record<string, boolean>; expandedChildCount: number } {
  const next = { ...compactExpanded(current) }
  let expandedChildCount = 0
  const walk = (node: SchemaNode) => {
    if (isTreeNodeExpanded(node, current, searching) && node.children?.length) {
      for (const child of node.children) {
        if (next[child.id] !== true) {
          next[child.id] = true
          expandedChildCount += 1
        }
      }
    }
    node.children?.forEach(walk)
  }
  schema.forEach(walk)
  return { next: compactExpanded(next), expandedChildCount }
}

export function expandSchemaTreeOneLevelToast(expandedChildCount: number): string {
  if (expandedChildCount <= 0) return '没有更多可展开的节点'
  return `已展开下一级（${expandedChildCount.toLocaleString('zh-CN')} 个节点）`
}
