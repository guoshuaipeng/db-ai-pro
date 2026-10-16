import { describe, expect, it } from 'vitest'
import {
  exportColumnFilterEmptyTitle,
  filterExportColumns,
  invertExportColumns,
} from './exportColumnUi'

describe('exportColumnUi', () => {
  it('filters and inverts columns', () => {
    const cols = ['id', 'name', 'email', 'created_at']
    expect(filterExportColumns(cols, 'id')).toEqual(['id'])
    expect(filterExportColumns(cols, 'mail')).toEqual(['email'])
    expect(invertExportColumns(cols, ['id', 'email'])).toEqual(['name', 'created_at'])
    expect(exportColumnFilterEmptyTitle()).toContain('没有')
  })
})
