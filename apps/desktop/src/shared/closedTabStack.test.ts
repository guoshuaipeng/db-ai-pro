import { describe, expect, it } from 'vitest'
import {
  CLOSED_TAB_STACK_CAP,
  peekClosedTab,
  popClosedTab,
  pushClosedTab,
  snapshotClosedTab,
} from './closedTabStack'

describe('closedTabStack', () => {
  it('pushes LIFO and caps', () => {
    let stack = pushClosedTab([], { title: 'a', sql: '1' }, 2)
    stack = pushClosedTab(stack, { title: 'b', sql: '2' }, 2)
    stack = pushClosedTab(stack, { title: 'c', sql: '3' }, 2)
    expect(stack.map((s) => s.title)).toEqual(['b', 'c'])
    expect(CLOSED_TAB_STACK_CAP).toBeGreaterThanOrEqual(10)
  })

  it('pops most recent first', () => {
    let stack = pushClosedTab([], { title: 'a', sql: '1' })
    stack = pushClosedTab(stack, { title: 'b', sql: '2' })
    expect(peekClosedTab(stack)?.title).toBe('b')
    const first = popClosedTab(stack)
    expect(first.item?.title).toBe('b')
    const second = popClosedTab(first.stack)
    expect(second.item?.title).toBe('a')
    expect(popClosedTab(second.stack).item).toBeNull()
  })

  it('snapshots without baselineSql', () => {
    const snap = snapshotClosedTab({
      id: '1',
      title: 't',
      sql: 'select 1',
      baselineSql: 'select 1',
      pinned: true,
      connectionId: 'c1',
    })
    expect(snap).toEqual({
      title: 't',
      sql: 'select 1',
      connectionId: 'c1',
      pinned: true,
    })
    expect('baselineSql' in snap).toBe(false)
  })
})
