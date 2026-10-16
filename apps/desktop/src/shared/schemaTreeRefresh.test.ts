import { describe, expect, it } from 'vitest'
import {
  collectNodeIds,
  replaceConnectionNode,
  seedExpanded,
} from './schemaTreeRefresh'
import type { SchemaNode } from './types'

const sample = (id: string, kind: SchemaNode['kind'], children?: SchemaNode[]): SchemaNode => ({
  id,
  kind,
  name: id,
  displayName: id,
  children,
})

describe('schemaTreeRefresh', () => {
  it('preserves collapsed state and seeds new nodes', () => {
    const tree = [
      sample('c1', 'connection', [
        sample('c1:db', 'database', [sample('c1:table:t1', 'table')]),
      ]),
    ]
    const current = { c1: true, 'c1:db': false }
    const next = seedExpanded(tree, current)
    expect(next.c1).toBe(true)
    expect(next['c1:db']).toBe(false)
    expect(next['c1:table:t1']).toBe(false)
  })

  it('replaces a connection root', () => {
    const a = sample('a', 'connection')
    const b = sample('b', 'connection')
    const b2 = sample('b', 'connection', [sample('b:db', 'database')])
    const out = replaceConnectionNode([a, b], 'b', b2)
    expect(out).toHaveLength(2)
    expect(out[1].children?.[0]?.id).toBe('b:db')
  })

  it('collects ids', () => {
    const tree = [sample('c', 'connection', [sample('c:db', 'database')])]
    expect([...collectNodeIds(tree)].sort()).toEqual(['c', 'c:db'])
  })
})
