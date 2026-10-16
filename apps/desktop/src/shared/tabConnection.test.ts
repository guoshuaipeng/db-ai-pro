import { describe, expect, it } from 'vitest'
import {
  resolveTabConnectionId,
  sqlEditorConnections,
  tabConnectionOptionLabel,
} from './tabConnection'
import type { ConnectionPublic } from './types'

const base = (partial: Partial<ConnectionPublic> & Pick<ConnectionPublic, 'id' | 'name' | 'dialect'>): ConnectionPublic => ({
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
  hasPassword: false,
  ...partial,
})

describe('sqlEditorConnections', () => {
  it('keeps executable dialects only', () => {
    const rows = [
      base({ id: '1', name: 'a', dialect: 'mysql' }),
      base({ id: '2', name: 'r', dialect: 'redis' }),
      base({ id: '3', name: 'o', dialect: 'oracle' }),
      base({ id: '4', name: 's', dialect: 'sqlite' }),
    ]
    expect(sqlEditorConnections(rows).map((r) => r.id)).toEqual(['1', '4'])
  })
})

describe('resolveTabConnectionId', () => {
  it('prefers tab bind over active', () => {
    expect(resolveTabConnectionId({ connectionId: 't1' }, 'a1')).toBe('t1')
  })
  it('falls back to active when tab unbound', () => {
    expect(resolveTabConnectionId({ connectionId: null }, 'a1')).toBe('a1')
    expect(resolveTabConnectionId({}, 'a1')).toBe('a1')
  })
  it('returns null when neither set', () => {
    expect(resolveTabConnectionId(null, null)).toBeNull()
  })
})

describe('tabConnectionOptionLabel', () => {
  it('joins dialect and name', () => {
    expect(tabConnectionOptionLabel(base({ id: '1', name: 'Prod', dialect: 'postgresql' }))).toBe(
      'PostgreSQL · Prod',
    )
  })
})