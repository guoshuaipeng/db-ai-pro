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


export type TreeSearchKind = 'all' | 'table' | 'column'

/** After text filter: keep only tables (drop columns) or only branches that still have columns. */
export function narrowTreeByKind(nodes: SchemaNode[], kind: TreeSearchKind): SchemaNode[] {
  if (kind === 'all') return nodes

  if (kind === 'table') {
    const visit = (node: SchemaNode): SchemaNode | null => {
      if (node.kind === 'column') return null
      if (node.kind === 'table') {
        return { ...node, children: undefined }
      }
      const children = (node.children ?? [])
        .map(visit)
        .filter((child): child is SchemaNode => child !== null)
      if (children.length === 0) return null
      return { ...node, children }
    }
    return nodes.map(visit).filter((node): node is SchemaNode => node !== null)
  }

  const visit = (node: SchemaNode): SchemaNode | null => {
    if (node.kind === 'column') return node
    const children = (node.children ?? [])
      .map(visit)
      .filter((child): child is SchemaNode => child !== null)
    if (children.length === 0) return null
    return { ...node, children }
  }
  return nodes.map(visit).filter((node): node is SchemaNode => node !== null)
}

export type MatchedTreeTable = {
  connectionId: string
  tableName: string
  /** "连接名 / table" for clipboard & UI */
  label: string
}

/** Flatten tables under a (usually filtered) schema tree. */
export function collectMatchedTables(nodes: SchemaNode[]): MatchedTreeTable[] {
  const out: MatchedTreeTable[] = []
  const walk = (list: SchemaNode[], connId: string, connLabel: string) => {
    for (const node of list) {
      if (node.kind === 'connection') {
        const id = node.connectionId ?? node.id
        const label = node.displayName || node.name || id
        walk(node.children ?? [], id, label)
        continue
      }
      if (node.kind === 'table') {
        const tableName = node.tableName || node.name
        const id = node.connectionId || connId
        if (tableName) {
          out.push({
            connectionId: id,
            tableName,
            label: `${connLabel} / ${tableName}`,
          })
        }
        continue
      }
      walk(node.children ?? [], connId, connLabel)
    }
  }
  walk(nodes, '', '')
  return out
}

export function formatMatchedTablesClipboard(tables: readonly MatchedTreeTable[]): string {
  return tables.map((row) => row.label).join('\n')
}

export function treeMatchedTablesCopiedToast(count: number): string {
  const n = Math.max(0, count)
  if (n === 0) return '没有可复制的表名'
  return `已复制 ${n} 张表名到剪贴板`
}

export function treeSearchKindEmptyBody(kind: TreeSearchKind): string {
  if (kind === 'table') return '当前关键字下没有表。可切换到「全部」或「列」，或清除搜索。'
  if (kind === 'column') return '当前关键字下没有列。可切换到「全部」或「表」，或清除搜索。'
  return '试试更短的关键字，或清除搜索后从连接树继续浏览。'
}
