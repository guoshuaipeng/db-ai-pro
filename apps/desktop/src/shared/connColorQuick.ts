/** Build a ConnectionInput that only updates colorTag (keeps password sealed). */

import type { ConnectionInput, ConnectionPublic } from './types'

export function connectionColorPatch(
  connection: ConnectionPublic,
  colorTag: string | null,
): ConnectionInput {
  const input: ConnectionInput = {
    id: connection.id,
    name: connection.name,
    dialect: connection.dialect,
    readOnly: connection.readOnly,
    groupId: connection.groupId ?? null,
    colorTag,
  }
  if (connection.dialect === 'sqlite') {
    input.filePath = connection.filePath
  } else {
    input.host = connection.host
    input.port = connection.port
    input.database = connection.database
    input.username = connection.username
  }
  return input
}