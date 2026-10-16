import { describe, expect, it } from 'vitest'
import {
  checkFilteredDatabases,
  keepOnlyFilteredDatabases,
} from './dbVisibility'
import {
  dbVisibilityNoneCheckedWarning,
  dbVisibilitySavedToast,
  dbVisibilitySelectionSummary,
} from './dbVisibilityUi'

describe('dbVisibility checkbox helpers', () => {
  it('checks filtered without dropping others', () => {
    const next = checkFilteredDatabases(['a', 'b'], new Set(['c']))
    expect([...next].sort()).toEqual(['a', 'b', 'c'])
  })

  it('keeps only filtered list', () => {
    expect([...keepOnlyFilteredDatabases(['a', 'b'])].sort()).toEqual(['a', 'b'])
  })
})

describe('dbVisibilityUi', () => {
  it('exposes Chinese selection and save copy', () => {
    expect(dbVisibilitySelectionSummary(0, 3)).toContain('未勾选')
    expect(dbVisibilitySelectionSummary(3, 3)).toContain('全选')
    expect(dbVisibilityNoneCheckedWarning()).toContain('未勾选')
    expect(dbVisibilitySavedToast(null)).toContain('全部')
    expect(dbVisibilitySavedToast([])).toContain('隐藏')
    expect(dbVisibilitySavedToast(['a', 'b'])).toContain('2')
  })
})
