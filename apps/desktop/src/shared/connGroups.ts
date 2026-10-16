import type { ConnectionGroup, ConnectionPublic, SchemaNode } from './types'

export const CONN_COLOR_TAGS = [
  { id: 'blue', label: '蓝', color: '#6ea8fe' },
  { id: 'teal', label: '青', color: '#4fd1c5' },
  { id: 'green', label: '绿', color: '#7ddea2' },
  { id: 'amber', label: '琥珀', color: '#e6c35c' },
  { id: 'orange', label: '橙', color: '#ff9e64' },
  { id: 'rose', label: '玫', color: '#f07178' },
  { id: 'purple', label: '紫', color: '#c792ea' },
  { id: 'slate', label: '灰', color: '#8b95a8' },
] as const

export type ConnColorTagId = (typeof CONN_COLOR_TAGS)[number]['id']

export function colorForTag(tag: string | null | undefined): string | null {
  if (!tag) return null
  const hit = CONN_COLOR_TAGS.find((row) => row.id === tag)
  return hit?.color ?? null
}

export function upsertConnGroup(list: ConnectionGroup[], next: ConnectionGroup): ConnectionGroup[] {
  const without = list.filter((row) => row.id !== next.id)
  return [...without, next].sort((a, b) => a.sort - b.sort || a.name.localeCompare(b.name, 'zh-CN'))
}

export type ConnGroupBucket = {
  group: ConnectionGroup | null
  connections: ConnectionPublic[]
  nodes: SchemaNode[]
}

/** Bucket schema roots (connection nodes) by connection.groupId. */
export function bucketSchemaByGroup(
  schema: SchemaNode[],
  connections: ConnectionPublic[],
  groups: ConnectionGroup[],
): ConnGroupBucket[] {
  const byId = new Map(connections.map((row) => [row.id, row]))
  const groupMap = new Map(groups.map((row) => [row.id, row]))
  const buckets = new Map<string | null, SchemaNode[]>()
  buckets.set(null, [])
  for (const group of groups) buckets.set(group.id, [])

  for (const node of schema) {
    if (node.kind !== 'connection') {
      buckets.get(null)!.push(node)
      continue
    }
    const conn = byId.get(node.connectionId ?? node.id)
    const gid = conn?.groupId && groupMap.has(conn.groupId) ? conn.groupId : null
    buckets.get(gid)!.push(node)
  }

  const result: ConnGroupBucket[] = [
    {
      group: null,
      nodes: buckets.get(null) ?? [],
      connections: connections.filter((row) => !row.groupId || !groupMap.has(row.groupId)),
    },
  ]
  for (const group of [...groups].sort((a, b) => a.sort - b.sort || a.name.localeCompare(b.name, 'zh-CN'))) {
    result.push({
      group,
      nodes: buckets.get(group.id) ?? [],
      connections: connections.filter((row) => row.groupId === group.id),
    })
  }
  // Hide empty ungrouped only when there are named groups and no ungrouped nodes? Keep ungrouped always if has nodes or no groups.
  return result.filter((bucket) => bucket.nodes.length > 0 || (bucket.group === null && groups.length === 0))
}
