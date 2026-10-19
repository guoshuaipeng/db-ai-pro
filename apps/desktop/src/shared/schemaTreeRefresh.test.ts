import { describe, expect, it } from 'vitest'
import {
  collectNodeIds,
  isTreeNodeExpanded,
  countOpenExpands,
  normalizeExpanded,
  compactExpanded,
  replaceConnectionNode,
  seedExpanded,
  defaultExpandForActiveConnection,
  expandAncestorsOf,
  findNodePath,
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
  it('seedExpanded keeps open flags and drops stale / false keys', () => {
    const tree = [
      sample('c1', 'connection', [
        sample('c1:db', 'database', [sample('c1:table:t1', 'table')]),
      ]),
    ]
    const current = { c1: true, 'c1:db': true, 'c1:table:t1': false, gone: true }
    const next = seedExpanded(tree, current)
    expect(next).toEqual({ c1: true, 'c1:db': true })
    expect(next['c1:table:t1']).toBeUndefined()
    expect(next.gone).toBeUndefined()
  })

  it('seedExpanded does not invent false entries for every node', () => {
    const tree = [
      sample('c1', 'connection', [
        sample('c1:db', 'database', [sample('c1:table:t1', 'table')]),
      ]),
    ]
    const next = seedExpanded(tree, {})
    expect(next).toEqual({})
  })

  it('isTreeNodeExpanded only opens explicit true (not all connections)', () => {
    const db = sample('c1:db', 'database')
    expect(isTreeNodeExpanded(db, {}, false)).toBe(false)
    expect(isTreeNodeExpanded(db, {}, true)).toBe(true)
    expect(isTreeNodeExpanded(db, { 'c1:db': true }, false)).toBe(true)
    expect(isTreeNodeExpanded(sample('c1', 'connection'), {}, false)).toBe(false)
    expect(isTreeNodeExpanded(sample('c1', 'connection'), { c1: true }, false)).toBe(true)
  })

  it('normalizeExpanded keeps only true', () => {
    expect(normalizeExpanded({ a: true, b: false, c: 'x', d: 1 })).toEqual({ a: true })
    expect(normalizeExpanded(null)).toEqual({})
    expect(compactExpanded({ a: true, b: false })).toEqual({ a: true })
  })

  it('defaultExpandForActiveConnection opens only that connection', () => {
    const tree = [sample('c1', 'connection'), sample('c2', 'connection')]
    expect(defaultExpandForActiveConnection(tree, 'c2')).toEqual({ c2: true })
    expect(defaultExpandForActiveConnection(tree, null)).toEqual({})
  })

  it('expandAncestorsOf opens parents of a table', () => {
    const tree = [
      sample('c1', 'connection', [
        sample('c1:db', 'database', [sample('c1:db:t', 'table')]),
      ]),
    ]
    const next = expandAncestorsOf(tree, 'c1:db:t', {})
    expect(next).toEqual({ c1: true, 'c1:db': true })
    expect(findNodePath(tree, 'c1:db:t')?.map((n) => n.id)).toEqual(['c1', 'c1:db', 'c1:db:t'])
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

  it('countOpenExpands', () => {
    expect(countOpenExpands({ a: true, b: false })).toBe(1)
  })
})

describe('collapseSchemaTreeExpanded', () => {
  it('keeps only connection opens', () => {
    const tree = [
      sample('c1', 'connection', [
        sample('c1:db', 'database', [sample('c1:db:t', 'table')]),
      ]),
    ]
    const next = collapseSchemaTreeExpanded(tree)
    expect(next).toEqual({ c1: true })
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
    expect(next['c1:db:t']).toBeUndefined()
  })
})

describe('expandSchemaTreeOneLevelToast', () => {
  it('reports count', () => {
    expect(expandSchemaTreeOneLevelToast(0)).toContain('没有')
    expect(expandSchemaTreeOneLevelToast(2)).toContain('2')
  })
})
