import { describe, expect, it } from 'vitest'
import {
  insertCopiedToast,
  quoteSqlIdent,
  rowsToInsertSql,
  rowsToValuesSql,
  sqlLiteral,
  suggestInsertTableName,
  valuesToInList,
} from './sqlCopy'

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

describe('rowsToInsertSql', () => {
  it('builds INSERT with bare idents', () => {
    const { sql, tableName } = rowsToInsertSql('orders', ['id', 'name'], [[1, 'a']])
    expect(tableName).toBe('orders')
    expect(sql).toContain('INSERT INTO orders (id, name)')
    expect(sql).toContain("VALUES\n(1, 'a');")
  })

  it('quotes odd table names', () => {
    expect(quoteSqlIdent('my table')).toBe('"my table"')
    expect(suggestInsertTableName(null)).toBe('my_table')
  })
})

describe('insertCopiedToast', () => {
  it('mentions table', () => {
    expect(insertCopiedToast(2, false, 't')).toContain('t')
    expect(insertCopiedToast(2, true, 't')).toContain('截断')
  })
})

