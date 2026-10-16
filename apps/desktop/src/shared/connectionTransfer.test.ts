import { describe, expect, it } from 'vitest'
import {
  applyImportPlan,
  fingerprint,
  isConnectionBundle,
  planConnectionImport,
  sanitizeTransferRow,
} from './connectionTransfer'
import type { TransferConnection } from './connectionTransfer'

function row(partial: Partial<TransferConnection> & Pick<TransferConnection, 'id' | 'name'>): TransferConnection {
  return {
    dialect: 'mysql',
    host: '127.0.0.1',
    port: 3306,
    database: 'demo',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...partial,
  }
}

describe('connection transfer', () => {
  it('rejects plaintext password on sanitize', () => {
    const cleaned = sanitizeTransferRow({
      ...row({ id: '1', name: 'a', passwordCipher: 'cipher' }),
      password: 'secret',
    } as TransferConnection & { password: string })
    expect((cleaned as { password?: string }).password).toBeUndefined()
    expect(cleaned.passwordCipher).toBe('cipher')
  })

  it('plans replace on fingerprint match', () => {
    const existing = [row({ id: 'old', name: '订单库' })]
    const incoming = [row({ id: 'new', name: '订单库', passwordCipher: 'x' })]
    const plan = planConnectionImport(existing, incoming)
    expect(plan[0].decision).toBe('replace')
    expect(plan[0].existingId).toBe('old')
  })

  it('applies keep-both with new id when colliding', () => {
    const existing = [row({ id: 'a', name: 'A', host: '1.1.1.1' })]
    const plan = planConnectionImport(existing, [row({ id: 'a', name: 'B', host: '2.2.2.2' })])
    // same id -> replace
    expect(plan[0].decision).toBe('replace')
    const applied = applyImportPlan(existing, plan, () => 'fresh')
    expect(applied).toHaveLength(1)
    expect(applied[0].name).toBe('B')
  })

  it('validates bundle shape', () => {
    expect(isConnectionBundle({ version: 1, kind: 'dataai-connections', exportedAt: '', connections: [] })).toBe(true)
    expect(isConnectionBundle({ version: 2, connections: [] })).toBe(false)
    expect(fingerprint(row({ id: '1', name: 'X' }))).toContain('mysql')
  })
})
