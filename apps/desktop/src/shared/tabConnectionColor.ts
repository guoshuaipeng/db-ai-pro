/** Resolve connection colorTag → CSS color for query tabs / crumb. */

import { colorForTag } from './connGroups'

export type ColorTaggedConnection = {
  id: string
  colorTag?: string | null
}

/** Hex color for a tab's bound connection, or null when unbound / untagged. */
export function resolveTabConnectionColor(
  connectionId: string | null | undefined,
  connections: readonly ColorTaggedConnection[],
): string | null {
  if (!connectionId) return null
  const conn = connections.find((row) => row.id === connectionId)
  if (!conn) return null
  return colorForTag(conn.colorTag)
}
