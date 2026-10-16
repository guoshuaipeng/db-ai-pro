import { describe, expect, it } from 'vitest'
import {
  baseResultColumns,
  canHideColumn,
  canInvertHiddenColumns,
  countHiddenColumns,
  invertHiddenColumns,
  pruneHiddenColumns,
  resetHiddenColumns,
  setColumnHidden,
  soloVisibleColumn,
  visibleResultColumns,
} from './resultColumnVisibility'

describe('resultColumnVisibility', () => {
  const columns = ['__rowid__', 'id', 'name', 'city']

  it('bases on non-rowid columns', () => {
    expect(baseResultColumns(columns)).toEqual(['id', 'name', 'city'])
  })

  it('filters hidden and never returns empty', () => {
    expect(visibleResultColumns(columns, ['name'])).toEqual(['id', 'city'])
    expect(visibleResultColumns(columns, ['id', 'name', 'city'])).toEqual(['id'])
  })

  it('refuses to hide the last column', () => {
    expect(canHideColumn(columns, ['id', 'name'], 'city')).toBe(false)
    expect(setColumnHidden(columns, ['id', 'name'], 'city', true)).toEqual(['id', 'name'])
    expect(setColumnHidden(columns, [], 'name', true)).toEqual(['name'])
    expect(setColumnHidden(columns, ['name'], 'name', false)).toEqual([])
  })

  it('prunes and resets', () => {
    expect(pruneHiddenColumns(['a', 'b'], ['a', 'gone'])).toEqual(['a'])
    expect(countHiddenColumns(columns, ['name', 'gone'])).toBe(1)
    expect(resetHiddenColumns()).toEqual([])
  })

  it('solos one column by hiding the rest', () => {
    expect(soloVisibleColumn(columns, 'name')).toEqual(['id', 'city'])
    expect(visibleResultColumns(columns, soloVisibleColumn(columns, 'name'))).toEqual(['name'])
    expect(soloVisibleColumn(columns, 'missing')).toEqual([])
  })

  it('inverts hidden columns and never hides all', () => {
    expect(invertHiddenColumns(columns, ['name'])).toEqual(['id', 'city'])
    expect(visibleResultColumns(columns, invertHiddenColumns(columns, ['name']))).toEqual(['name'])
    // all visible → keep first
    expect(invertHiddenColumns(columns, [])).toEqual(['name', 'city'])
    expect(visibleResultColumns(columns, invertHiddenColumns(columns, []))).toEqual(['id'])
    expect(canInvertHiddenColumns(columns, [])).toBe(true)
    expect(canInvertHiddenColumns(['only'], [])).toBe(false)
  })
})
