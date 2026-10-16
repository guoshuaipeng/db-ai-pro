/** Helpers for refreshing the connection/object tree while preserving expand state. */

import type { SchemaNode } from './types'

/** Seed expand flags for new nodes; keep existing keys (including collapsed=false). */
export function seedExpanded(
  nodes: SchemaNode[],
  current: Record<string, boolean> = {},
): Record<string, boolean> {
  const next = { ...current }
  const walk = (node: SchemaNode) => {
    if (next[node.id] === undefined) {
      // Default: expand connection/database folders; leave tables collapsed.
      next[node.id] = node.kind !== 'table'
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
