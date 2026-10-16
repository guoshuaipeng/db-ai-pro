import { describe, expect, it } from 'vitest'
import {
  countSqlStatements,
  sqlStatementCountLabel,
  sqlStatementCountTitle,
} from './sqlStatementCount'

describe('sqlStatementCount', () => {
  it('counts split statements', () => {
    expect(countSqlStatements('')).toBe(0)
    expect(countSqlStatements('SELECT 1')).toBe(1)
    expect(countSqlStatements('SELECT 1; SELECT 2;')).toBe(2)
    expect(countSqlStatements("SELECT ';'; SELECT 2")).toBe(2)
  })

  it('labels only when 2+', () => {
    expect(sqlStatementCountLabel(0)).toBeNull()
    expect(sqlStatementCountLabel(1)).toBeNull()
    expect(sqlStatementCountLabel(3)).toBe('3 条语句')
    expect(sqlStatementCountTitle(3)).toContain('3')
  })
})
