import { describe, expect, it } from 'vitest'
import {
  alignSchemaCacheToConnections,
  compactSchemaForCache,
  normalizeSchemaCache,
} from './schemaCache'
import type { SchemaNode } from './types'

const sample = (id: string, kind: SchemaNode['kind'], children?: SchemaNode[]): SchemaNode => ({
  id,
  kind,
  name: id,
  displayName: id,
  connectionId: id.split(':')[0],
  children,
})

describe('schemaCache', () => {
  it('strips columns/keys but keeps databases and tables', () => {
    const tree = [
      sample('c1', 'connection', [
        sample('c1:db', 'database', [
          sample('c1:db:t', 'table', [
            sample('c1:db:t:col', 'column'),
            sample('c1:db:t:key', 'key'),
          ]),
        ]),
      ]),
    ]
    const compact = compactSchemaForCache(tree)
    expect(compact[0].children?.[0].children?.[0].id).toBe('c1:db:t')
    expect(compact[0].children?.[0].children?.[0].children ?? []).toEqual([])
  })

  it('aligns cache to current connection ids', () => {
    const cached = [sample('c1', 'connection'), sample('c2', 'connection')]
    expect(alignSchemaCacheToConnections(cached, ['c2']).map((n) => n.id)).toEqual(['c2'])
    expect(alignSchemaCacheToConnections(cached, [])).toEqual([])
  })

  it('normalizeSchemaCache rejects bad payloads', () => {
    expect(normalizeSchemaCache(null)).toBeNull()
    expect(normalizeSchemaCache({ version: 1, nodes: [{ id: 'c1', kind: 'connection', name: 'a', displayName: 'a' }] })?.nodes).toHaveLength(1)
  })
})
