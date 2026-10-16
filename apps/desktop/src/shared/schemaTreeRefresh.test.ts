import { describe, expect, it } from 'vitest'
import {
  collectNodeIds,
  isTreeNodeExpanded,
  normalizeExpanded,
  replaceConnectionNode,
  seedExpanded,
  collapseSchemaTreeExpanded,
  collapseSchemaTreeToast,
  expandSchemaTreeOneLevel,
  expandSchemaTreeOneLevelToast,
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

  it('defaults only connection roots open (not databases)', () => {
    const tree = [
      sample('c1', 'connection', [
        sample('c1:db', 'database', [sample('c1:table:t1', 'table')]),
      ]),
    ]
    const next = seedExpanded(tree, {})
    expect(next.c1).toBe(true)
    expect(next['c1:db']).toBe(false)
    expect(next['c1:table:t1']).toBe(false)
  })

  it('isTreeNodeExpanded respects search and defaults', () => {
    const db = sample('c1:db', 'database')
    expect(isTreeNodeExpanded(db, {}, false)).toBe(false)
    expect(isTreeNodeExpanded(db, {}, true)).toBe(true)
    expect(isTreeNodeExpanded(db, { 'c1:db': true }, false)).toBe(true)
    expect(isTreeNodeExpanded(sample('c1', 'connection'), {}, false)).toBe(true)
  })

  it('normalizeExpanded keeps booleans only', () => {
    expect(normalizeExpanded({ a: true, b: false, c: 'x', d: 1 })).toEqual({ a: true, b: false })
    expect(normalizeExpanded(null)).toEqual({})
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

describe('collapseSchemaTreeExpanded', () => {
  it('keeps connections open and collapses children', () => {
    const tree = [
      {
        id: 'c1',
        kind: 'connection' as const,
        label: 'Local',
        children: [
          {
            id: 'c1:db',
            kind: 'database' as const,
            label: 'db',
            children: [{ id: 'c1:db:t', kind: 'table' as const, label: 't' }],
          },
        ],
      },
    ]
    const next = collapseSchemaTreeExpanded(tree as any)
    expect(next['c1']).toBe(true)
    expect(next['c1:db']).toBe(false)
    expect(next['c1:db:t']).toBe(false)
  })
})

describe('collapseSchemaTreeToast', () => {
  it('mentions search when cleared', () => {
    expect(collapseSchemaTreeToast(false)).toContain('折叠')
    expect(collapseSchemaTreeToast(true)).toContain('搜索')
  })
})

describe('expandSchemaTreeOneLevel', () => {
  it('expands children of open connections', () => {
    const tree = [
      sample('c1', 'connection', [
        sample('c1:db', 'database', [sample('c1:db:t', 'table')]),
      ]),
    ]
    const { next, expandedChildCount } = expandSchemaTreeOneLevel(tree, { c1: true }, false)
    expect(next['c1:db']).toBe(true)
    expect(expandedChildCount).toBeGreaterThan(0)
    expect(next['c1:db:t']).not.toBe(true)
  })

  it('second pass expands tables under databases', () => {
    const tree = [
      sample('c1', 'connection', [
        sample('c1:db', 'database', [sample('c1:db:t', 'table')]),
      ]),
    ]
    const first = expandSchemaTreeOneLevel(tree, { c1: true }, false).next
    const second = expandSchemaTreeOneLevel(tree, first, false)
    expect(second.next['c1:db:t']).toBe(true)
  })
})

describe('expandSchemaTreeOneLevelToast', () => {
  it('handles empty and counted', () => {
    expect(expandSchemaTreeOneLevelToast(0)).toContain('没有')
    expect(expandSchemaTreeOneLevelToast(2)).toContain('2')
  })
})

