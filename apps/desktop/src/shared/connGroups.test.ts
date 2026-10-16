import { describe, expect, it } from 'vitest'
import { bucketSchemaByGroup, colorForTag, upsertConnGroup } from './connGroups'
import type { ConnectionGroup, ConnectionPublic, SchemaNode } from './types'

function conn(partial: Partial<ConnectionPublic> & Pick<ConnectionPublic, 'id' | 'name'>): ConnectionPublic {
  return {
    dialect: 'sqlite',
    hasPassword: false,
    createdAt: 't',
    updatedAt: 't',
    ...partial,
  }
}

describe('connGroups', () => {
  it('upserts and colors', () => {
    const a: ConnectionGroup = { id: 'g1', name: '生产', sort: 1, createdAt: 't', updatedAt: 't' }
    const b: ConnectionGroup = { id: 'g1', name: '生产库', sort: 1, createdAt: 't', updatedAt: 't' }
    expect(upsertConnGroup([a], b)[0].name).toBe('生产库')
    expect(colorForTag('blue')).toMatch(/^#/)
  })

  it('buckets schema by group', () => {
    const groups: ConnectionGroup[] = [
      { id: 'g1', name: 'Prod', sort: 0, createdAt: 't', updatedAt: 't' },
    ]
    const connections = [
      conn({ id: 'c1', name: 'A', groupId: 'g1' }),
      conn({ id: 'c2', name: 'B' }),
    ]
    const schema: SchemaNode[] = [
      { id: 'c1', kind: 'connection', name: 'A', displayName: 'A', connectionId: 'c1' },
      { id: 'c2', kind: 'connection', name: 'B', displayName: 'B', connectionId: 'c2' },
    ]
    const buckets = bucketSchemaByGroup(schema, connections, groups)
    expect(buckets.find((b) => b.group?.id === 'g1')?.nodes.map((n) => n.id)).toEqual(['c1'])
    expect(buckets.find((b) => b.group === null)?.nodes.map((n) => n.id)).toEqual(['c2'])
  })
})
