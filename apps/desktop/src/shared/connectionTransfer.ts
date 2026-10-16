import type { Dialect } from './types'

export type TransferConnection = {
  id: string
  name: string
  dialect: Dialect
  filePath?: string
  host?: string
  port?: number
  database?: string
  username?: string
  /** Sealed only — never plaintext password. */
  passwordCipher?: string
  createdAt: string
  updatedAt: string
}

export type ConnectionBundle = {
  version: 1
  kind: 'dataai-connections'
  exportedAt: string
  connections: TransferConnection[]
}

export type ImportDecision = 'skip' | 'replace' | 'keep-both'

export type ImportPlanItem = {
  incoming: TransferConnection
  existingId?: string
  decision: ImportDecision
  reason: string
}

export function isConnectionBundle(value: unknown): value is ConnectionBundle {
  if (!value || typeof value !== 'object') return false
  const row = value as ConnectionBundle
  return row.version === 1 && row.kind === 'dataai-connections' && Array.isArray(row.connections)
}

export function fingerprint(row: Pick<TransferConnection, 'name' | 'dialect' | 'host' | 'port' | 'database' | 'filePath'>): string {
  return [
    row.dialect,
    row.name.trim().toLowerCase(),
    (row.host ?? '').trim().toLowerCase(),
    String(row.port ?? ''),
    (row.database ?? row.filePath ?? '').trim().toLowerCase(),
  ].join('|')
}

/** Strip any accidental plaintext password field before write/export. */
export function sanitizeTransferRow(row: TransferConnection & { password?: string }): TransferConnection {
  const {
    id,
    name,
    dialect,
    filePath,
    host,
    port,
    database,
    username,
    passwordCipher,
    createdAt,
    updatedAt,
  } = row
  return {
    id,
    name,
    dialect,
    filePath,
    host,
    port,
    database,
    username,
    passwordCipher: passwordCipher || undefined,
    createdAt,
    updatedAt,
  }
}

export function planConnectionImport(
  existing: TransferConnection[],
  incoming: TransferConnection[],
): ImportPlanItem[] {
  const byId = new Map(existing.map((row) => [row.id, row]))
  const byFp = new Map(existing.map((row) => [fingerprint(row), row]))
  return incoming.map((raw) => {
    const row = sanitizeTransferRow(raw)
    const sameId = byId.get(row.id)
    if (sameId) {
      return {
        incoming: row,
        existingId: sameId.id,
        decision: 'replace' as const,
        reason: '相同 ID，将覆盖',
      }
    }
    const sameFp = byFp.get(fingerprint(row))
    if (sameFp) {
      return {
        incoming: row,
        existingId: sameFp.id,
        decision: 'replace' as const,
        reason: '相同名称/主机/库，将覆盖',
      }
    }
    return {
      incoming: row,
      decision: 'keep-both' as const,
      reason: '新建连接',
    }
  })
}

export function applyImportPlan(
  existing: TransferConnection[],
  plan: ImportPlanItem[],
  createId: () => string,
  now = () => new Date().toISOString(),
): TransferConnection[] {
  let rows = [...existing]
  for (const item of plan) {
    if (item.decision === 'skip') continue
    const stamp = now()
    if (item.decision === 'replace' && item.existingId) {
      rows = rows.filter((row) => row.id !== item.existingId)
      rows.push({
        ...sanitizeTransferRow(item.incoming),
        id: item.existingId,
        updatedAt: stamp,
        createdAt: existing.find((row) => row.id === item.existingId)?.createdAt ?? stamp,
      })
      continue
    }
    // keep-both / new
    const id = rows.some((row) => row.id === item.incoming.id) ? createId() : item.incoming.id
    rows.push({
      ...sanitizeTransferRow(item.incoming),
      id,
      createdAt: stamp,
      updatedAt: stamp,
    })
  }
  return rows
}
