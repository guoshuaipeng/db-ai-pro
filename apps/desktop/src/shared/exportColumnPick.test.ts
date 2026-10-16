import { describe, expect, it } from 'vitest'
import {
  defaultExportColumns,
  normalizePickedColumns,
  selectAllExportColumns,
  selectNoneExportColumns,
  togglePickedColumn,
} from './exportColumnPick'

describe('exportColumnPick', () => {
  const columns = ['__rowid__', 'id', 'name', 'city']

  it('defaults to visible columns without __rowid__', () => {
    expect(defaultExportColumns(columns)).toEqual(['id', 'name', 'city'])
  })

  it('normalizes pick order to table order and drops unknown', () => {
    expect(normalizePickedColumns(columns, ['city', 'nope', 'id', 'id'])).toEqual(['id', 'city'])
  })

  it('toggles and select all / none', () => {
    expect(togglePickedColumn(['id'], 'name', true)).toEqual(['id', 'name'])
    expect(togglePickedColumn(['id', 'name'], 'id', false)).toEqual(['name'])
    expect(selectAllExportColumns(columns)).toEqual(['id', 'name', 'city'])
    expect(selectNoneExportColumns()).toEqual([])
  })
})
