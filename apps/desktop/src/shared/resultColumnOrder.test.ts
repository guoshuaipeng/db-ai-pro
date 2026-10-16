import { describe, expect, it } from 'vitest'
import {
  canMoveColumnAmongVisible,
  canMoveColumnInOrder,
  moveColumnAmongVisible,
  moveColumnInOrder,
  normalizeColumnOrder,
  orderVisibleColumns,
} from './resultColumnOrder'

describe('resultColumnOrder', () => {
  const columns = ['__rowid__', 'id', 'name', 'city']

  it('normalizes order and appends new columns', () => {
    expect(normalizeColumnOrder(columns, ['city', 'id'])).toEqual(['city', 'id', 'name'])
    expect(normalizeColumnOrder(columns, [])).toEqual(['id', 'name', 'city'])
  })

  it('orders visible subset', () => {
    expect(orderVisibleColumns(['city', 'id', 'name'], ['name', 'city'])).toEqual(['city', 'name'])
  })

  it('moves in full order', () => {
    const order = ['id', 'name', 'city']
    expect(moveColumnInOrder(order, 'name', -1)).toEqual(['name', 'id', 'city'])
    expect(moveColumnInOrder(order, 'id', -1)).toEqual(order)
    expect(canMoveColumnInOrder(order, 'id', -1)).toBe(false)
    expect(canMoveColumnInOrder(order, 'id', 1)).toBe(true)
  })

  it('moves among visible skipping hidden', () => {
    const order = ['id', 'name', 'city']
    const visible = ['id', 'city']
    expect(moveColumnAmongVisible(order, visible, 'id', 1)).toEqual(['city', 'name', 'id'])
    expect(canMoveColumnAmongVisible(order, visible, 'id', 1)).toBe(true)
    expect(canMoveColumnAmongVisible(order, visible, 'city', 1)).toBe(false)
  })
})
