import { describe, expect, it } from 'vitest'
import {
  defaultExportColumns,
  defaultExportRowScope,
  exportRowScopeOptionLabel,
  exportRowScopeSummary,
  normalizePickedColumns,
  resolveExportRows,
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

  it('defaults export row scope to selected when any selected', () => {
    expect(defaultExportRowScope(0)).toBe('all')
    expect(defaultExportRowScope(3)).toBe('selected')
  })

  it('resolves export rows by scope', () => {
    const all = [{ a: 1 }, { a: 2 }, { a: 3 }]
    const selected = [{ a: 2 }]
    expect(resolveExportRows(all, selected, 'selected')).toEqual([{ a: 2 }])
    expect(resolveExportRows(all, selected, 'all')).toEqual(all)
    expect(resolveExportRows(all, undefined, 'selected')).toEqual(all)
  })

  it('summarizes and labels row scope in Chinese', () => {
    expect(exportRowScopeSummary('all', 10, 0)).toContain('10')
    expect(exportRowScopeSummary('selected', 10, 3)).toContain('3')
    expect(exportRowScopeSummary('all', 10, 3)).toContain('忽略')
    expect(exportRowScopeOptionLabel('selected', 10, 3)).toContain('选中')
    expect(exportRowScopeOptionLabel('all', 10, 3)).toContain('全部')
  })

