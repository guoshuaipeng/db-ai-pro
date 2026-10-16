import type { ConnectionPublic, SchemaNode } from './types'

export type TreeSearchExtra = {
  host?: string
  database?: string
  username?: string
}

function haystackFor(node: SchemaNode, extras?: TreeSearchExtra): string {
  return [
    node.displayName,
    node.name,
    node.tableName,
    node.dataType,
    node.dialect,
    node.redisKey,
    node.redisType,
    node.note,
    extras?.host,
    extras?.database,
    extras?.username,
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase()
}

/** Filter connection/object tree by name, host, DB, column type, etc. Matching ancestors keep matching descendants. */
export function filterNodes(
  nodes: SchemaNode[],
  query: string,
  connectionExtras: Record<string, TreeSearchExtra> = {},
): SchemaNode[] {
  const needle = query.trim().toLowerCase()
  if (!needle) return nodes

  const visit = (node: SchemaNode): SchemaNode | null => {
    const connectionId = node.connectionId ?? (node.kind === 'connection' ? node.id : undefined)
    const extras = connectionId ? connectionExtras[connectionId] : undefined
    const selfMatch = haystackFor(node, extras).includes(needle)
    const children = (node.children ?? [])
      .map(visit)
      .filter((child): child is SchemaNode => child !== null)

    if (selfMatch) {
      // Keep full subtree when the node itself matches (e.g. connection name / host).
      return node
    }
    if (children.length === 0) return null
    return { ...node, children }
  }

  return nodes.map(visit).filter((node): node is SchemaNode => node !== null)
}

export function extrasFromConnections(rows: ConnectionPublic[]): Record<string, TreeSearchExtra> {
  const map: Record<string, TreeSearchExtra> = {}
  for (const row of rows) {
    map[row.id] = {
      host: row.host,
      database: row.database ?? row.filePath,
      username: row.username,
    }
  }
  return map
}

export function countTreeNodes(nodes: SchemaNode[]): { connections: number; tables: number; columns: number } {
  let connections = 0
  let tables = 0
  let columns = 0
  const walk = (list: SchemaNode[]) => {
    for (const node of list) {
      if (node.kind === 'connection') connections += 1
      if (node.kind === 'table') tables += 1
      if (node.kind === 'column') columns += 1
      if (node.children) walk(node.children)
    }
  }
  walk(nodes)
  return { connections, tables, columns }
}
