/** Helpers for refreshing the connection/object tree while preserving expand state. */

import type { SchemaNode } from './types'

/** Cap persisted expand map size (connection + a few open folders). */
export const EXPANDED_KEY_CAP = 2_000

/** Normalize a persisted expand map; drop non-booleans. */
export function normalizeExpanded(raw: unknown): Record<string, boolean> {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {}
  const next: Record<string, boolean> = {}
  for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
    if (typeof key !== 'string' || !key.trim()) continue
    if (typeof value !== 'boolean') continue
    next[key] = value
    if (Object.keys(next).length >= EXPANDED_KEY_CAP) break
  }
  return next
}

/**
 * Whether a tree node should render expanded.
 * Search forces expand. Explicit map wins. Unset → only connection roots open.
 */
export function isTreeNodeExpanded(
  node: Pick<SchemaNode, 'id' | 'kind'>,
  expanded: Record<string, boolean>,
  searching: boolean,
): boolean {
  if (searching) return true
  const flag = expanded[node.id]
  if (flag !== undefined) return flag
  return node.kind === 'connection'
}

/** Seed expand flags for new nodes; keep existing keys (including collapsed=false). */
export function seedExpanded(
  nodes: SchemaNode[],
  current: Record<string, boolean> = {},
): Record<string, boolean> {
  const next = { ...current }
  const walk = (node: SchemaNode) => {
    if (next[node.id] === undefined) {
      // Default: only connection roots open; databases/tables stay collapsed until user expands.
      next[node.id] = node.kind === 'connection'
    }
    node.children?.forEach(walk)
  }
  nodes.forEach(walk)
  return next
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
 * Rebuilds the map from the current schema so stale keys are dropped.
 */
export function collapseSchemaTreeExpanded(schema: SchemaNode[]): Record<string, boolean> {
  const next: Record<string, boolean> = {}
  const walk = (node: SchemaNode) => {
    next[node.id] = node.kind === 'connection'
    node.children?.forEach(walk)
  }
  schema.forEach(walk)
  return next
}

export function collapseSchemaTreeToast(clearedSearch: boolean): string {
  return clearedSearch ? '已折叠对象树并清除搜索' : '已折叠对象树'
}

