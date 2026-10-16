/** Resolve / filter connections for query-tab binding (M74). */

import { dialectInfo } from './types'
import type { ConnectionPublic, EditorTabState } from './types'

/** Connections that can run SQL in the editor (excludes Redis / pending dialects). */
export function sqlEditorConnections(connections: readonly ConnectionPublic[]): ConnectionPublic[] {
  return connections.filter((row) => dialectInfo(row.dialect).executable)
}

/** Effective connection id for a tab: explicit bind, else workspace active. */
export function resolveTabConnectionId(
  tab: Pick<EditorTabState, 'connectionId'> | null | undefined,
  activeConnectionId: string | null | undefined,
): string | null {
  const bound = tab?.connectionId?.trim()
  if (bound) return bound
  const active = activeConnectionId?.trim()
  return active || null
}

/** Label for the toolbar select: dialect · name */
export function tabConnectionOptionLabel(connection: ConnectionPublic): string {
  const dialect = dialectInfo(connection.dialect).label
  return `${dialect} · ${connection.name}`
}