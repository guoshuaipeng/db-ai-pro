import type { SchemaNode } from './types'

export function filterNodes(nodes: SchemaNode[], query: string): SchemaNode[] {
  const needle = query.trim().toLowerCase()
  if (!needle) return nodes

  const visit = (node: SchemaNode): SchemaNode | null => {
    const haystack = `${node.displayName} ${node.name}`.toLowerCase()
    if (haystack.includes(needle)) return node
    const children = (node.children ?? [])
      .map(visit)
      .filter((child): child is SchemaNode => child !== null)
    if (children.length === 0) return null
    return { ...node, children }
  }

  return nodes.map(visit).filter((node): node is SchemaNode => node !== null)
}
