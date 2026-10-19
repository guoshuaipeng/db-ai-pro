/** Resolve which DB connection the AI pane should use (tab bind first). */

import { resolveTabConnectionId } from './tabConnection'
import { dialectInfo, type ConnectionPublic, type EditorTabState, type SchemaNode } from './types'

export function resolveAiConnectionId(
  tab: Pick<EditorTabState, 'connectionId'> | null | undefined,
  activeConnectionId: string | null | undefined,
): string | null {
  return resolveTabConnectionId(tab, activeConnectionId)
}

export function resolveAiDatabaseName(
  tab: Pick<EditorTabState, 'databaseName' | 'browse'> | null | undefined,
): string | undefined {
  const fromTab = tab?.databaseName?.trim()
  if (fromTab) return fromTab
  const fromBrowse = tab?.browse?.databaseName?.trim()
  return fromBrowse || undefined
}

/** Table names under one connection root (not the whole forest). */
export function tableNamesForConnection(
  schema: readonly SchemaNode[],
  connectionId: string | null | undefined,
): string[] {
  const id = connectionId?.trim()
  if (!id) return []
  const root =
    schema.find((node) => node.id === id) ??
    schema.find((node) => node.connectionId === id && node.kind === 'connection')
  const names: string[] = []
  const walk = (nodes: readonly SchemaNode[], underTarget: boolean) => {
    for (const node of nodes) {
      const here =
        underTarget ||
        node.id === id ||
        node.connectionId === id
      if (node.kind === 'table' && here) {
        const table = (node.tableName || node.name || '').trim()
        if (table) names.push(table)
      }
      if (node.children?.length) walk(node.children, here)
    }
  }
  if (root) walk([root], true)
  else walk(schema, false)
  return [...new Set(names)]
}

export function aiConnectionHint(
  connection: ConnectionPublic | null | undefined,
  opts?: { fromTabBind?: boolean; missing?: boolean },
): string {
  if (opts?.missing || !connection) return '未绑定连接 · 请先在查询标签选择连接'
  const dialect = dialectInfo(connection.dialect).label
  const source = opts?.fromTabBind ? '当前标签' : '侧栏活动'
  return `${source} · ${dialect} · ${connection.name}`
}
