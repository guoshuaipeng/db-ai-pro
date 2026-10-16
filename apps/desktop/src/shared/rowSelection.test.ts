import { describe, expect, it } from 'vitest'
import {
  rangeRowIndexes,
  selectAllRowIndexes,
  selectedRowsFromIndexes,
  toggleRowIndex,
} from './rowSelection'

describe('rowSelection', () => {
  it('toggles indexes', () => {
    let set = new Set<number>()
    set = toggleRowIndex(set, 2)
    expect([...set]).toEqual([2])
    set = toggleRowIndex(set, 2)
    expect([...set]).toEqual([])
  })

  it('builds inclusive ranges and maps rows', () => {
    expect([...rangeRowIndexes(3, 1)].sort((a, b) => a - b)).toEqual([1, 2, 3])
    expect([...selectAllRowIndexes(3)].sort((a, b) => a - b)).toEqual([0, 1, 2])
    const rows = ['a', 'b', 'c', 'd']
    expect(selectedRowsFromIndexes(rows, new Set([3, 1]))).toEqual(['b', 'd'])
  })
})
