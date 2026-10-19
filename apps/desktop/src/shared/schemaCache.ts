/** Persist last successful object-tree forest for instant cold-start paint. */

import type { SchemaNode } from './types'

export const SCHEMA_CACHE_VERSION = 1 as const

export type SchemaCacheFile = {
  version: typeof SCHEMA_CACHE_VERSION
  updatedAt: string
  /** Connection-root nodes only (aligned to known connection ids on load). */
  nodes: SchemaNode[]
}

/** Drop column/key leaves so the cache stays small but DB + table lists paint instantly. */
export function compactSchemaForCache(nodes: SchemaNode[]): SchemaNode[] {
  return nodes.map(compactNode)
}

function compactNode(node: SchemaNode): SchemaNode {
  const kids = node.children
  if (!kids?.length) {
    const { children: _drop, ...rest } = node
    return kids ? { ...rest, children: [] } : { ...rest }
  }
  const nextKids = kids
    .filter((child) => child.kind !== 'column' && child.kind !== 'key')
    .map(compactNode)
  return { ...node, children: nextKids }
}

/** Keep cached roots that still exist in the connection list (stable id). */
export function alignSchemaCacheToConnections(
  cached: SchemaNode[] | null | undefined,
  connectionIds: ReadonlyArray<string>,
): SchemaNode[] {
  if (!cached?.length || connectionIds.length === 0) return []
  const want = new Set(connectionIds)
  return cached.filter((node) => want.has(node.id) || (node.connectionId != null && want.has(node.connectionId)))
}

export function normalizeSchemaCache(raw: unknown): SchemaCacheFile | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null
  const row = raw as Partial<SchemaCacheFile>
  if (row.version !== SCHEMA_CACHE_VERSION) return null
  if (!Array.isArray(row.nodes)) return null
  const nodes = row.nodes.filter((n) => n && typeof n === 'object' && typeof (n as SchemaNode).id === 'string') as SchemaNode[]
  return {
    version: SCHEMA_CACHE_VERSION,
    updatedAt: typeof row.updatedAt === 'string' ? row.updatedAt : new Date(0).toISOString(),
    nodes: compactSchemaForCache(nodes),
  }
}
