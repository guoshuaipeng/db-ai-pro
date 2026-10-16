import { describe, expect, it } from 'vitest'
import { buildExplainSql, formatExplainText, primaryStatement } from './explain'

describe('buildExplainSql', () => {
  it('wraps sqlite with EXPLAIN QUERY PLAN', () => {
    const built = buildExplainSql('sqlite', 'SELECT 1;')
    expect(built.ok).toBe(true)
    if (built.ok) expect(built.sql).toBe('EXPLAIN QUERY PLAN SELECT 1')
  })

  it('wraps mysql and postgres', () => {
    const mysql = buildExplainSql('mysql', 'select * from t')
    expect(mysql.ok).toBe(true)
    if (mysql.ok) expect(mysql.sql).toContain('EXPLAIN select * from t')
    const pg = buildExplainSql('postgresql', 'select 1')
    expect(pg.ok).toBe(true)
    if (pg.ok) expect(pg.sql).toContain('EXPLAIN (FORMAT TEXT)')
  })

  it('builds sqlserver showplan batch', () => {
    const built = buildExplainSql('sqlserver', 'SELECT 1')
    expect(built.ok).toBe(true)
    if (built.ok) {
      expect(built.sql).toContain('SET SHOWPLAN_ALL ON')
      expect(built.sql).toContain('SELECT 1')
    }
  })

  it('rejects empty and redis', () => {
    expect(buildExplainSql('sqlite', '   ').ok).toBe(false)
    expect(buildExplainSql('redis', 'select 1').ok).toBe(false)
  })
})

describe('helpers', () => {
  it('picks primary statement', () => {
    expect(primaryStatement('select 1; select 2')).toBe('select 1')
  })

  it('formats plan table text', () => {
    const text = formatExplainText(['id', 'detail'], [{ id: 1, detail: 'SCAN' }])
    expect(text).toContain('SCAN')
    expect(text.split('\n')[0]).toContain('id')
  })
})
