import { describe, expect, it } from 'vitest'
import { pickRunSql, selectionIsNonEmpty } from './runSqlPick'

describe('pickRunSql', () => {
  it('uses full SQL when selection empty', () => {
    expect(pickRunSql('SELECT 1;\nSELECT 2;', '')).toEqual({
      sql: 'SELECT 1;\nSELECT 2;',
      fromSelection: false,
    })
    expect(pickRunSql('SELECT 1;', null)).toEqual({ sql: 'SELECT 1;', fromSelection: false })
    expect(pickRunSql('SELECT 1;', '   ')).toEqual({ sql: 'SELECT 1;', fromSelection: false })
  })

  it('prefers trimmed selection', () => {
    expect(pickRunSql('SELECT 1;\nSELECT 2;', '  SELECT 2;  ')).toEqual({
      sql: 'SELECT 2;',
      fromSelection: true,
    })
  })
})

describe('selectionIsNonEmpty', () => {
  it('detects range', () => {
    expect(selectionIsNonEmpty(1, 1, 1, 1)).toBe(false)
    expect(selectionIsNonEmpty(1, 1, 1, 5)).toBe(true)
    expect(selectionIsNonEmpty(1, 1, 2, 1)).toBe(true)
  })
})