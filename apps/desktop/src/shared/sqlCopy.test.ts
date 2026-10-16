import { describe, expect, it } from 'vitest'
import { rowsToValuesSql, sqlLiteral, valuesToInList } from './sqlCopy'

describe('sqlCopy', () => {
  it('quotes literals', () => {
    expect(sqlLiteral(null)).toBe('NULL')
    expect(sqlLiteral(42)).toBe('42')
    expect(sqlLiteral("O'Hara")).toBe("'O''Hara'")
    expect(sqlLiteral(true)).toBe('TRUE')
  })

  it('builds IN list with distinct', () => {
    const { sql, count } = valuesToInList([1, 1, 'a', null])
    expect(sql).toBe("(1, 'a', NULL)")
    expect(count).toBe(3)
  })

  it('builds VALUES rows', () => {
    const { sql } = rowsToValuesSql([
      [1, 'x'],
      [2, null],
    ])
    expect(sql).toBe("(1, 'x'),\n(2, NULL)")
  })
})
