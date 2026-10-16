import { describe, expect, it } from 'vitest'
import { analyzeDestructiveSql, destructiveSummary } from './destructiveSql'

describe('analyzeDestructiveSql', () => {
  it('flags DROP and TRUNCATE', () => {
    expect(analyzeDestructiveSql('DROP TABLE t').destructive).toBe(true)
    expect(analyzeDestructiveSql('TRUNCATE TABLE t').hits[0]?.kind).toBe('truncate')
  })

  it('flags DELETE without WHERE', () => {
    const hit = analyzeDestructiveSql('DELETE FROM orders')
    expect(hit.destructive).toBe(true)
    expect(hit.hits[0]?.kind).toBe('delete-no-where')
  })

  it('allows DELETE with WHERE', () => {
    expect(analyzeDestructiveSql('DELETE FROM orders WHERE id = 1').destructive).toBe(false)
  })

  it('ignores comments that look destructive', () => {
    expect(analyzeDestructiveSql('-- DROP TABLE t\nSELECT 1').destructive).toBe(false)
  })

  it('scans multi-statement scripts', () => {
    const result = analyzeDestructiveSql('SELECT 1; DELETE FROM t; SELECT 2')
    expect(result.hits).toHaveLength(1)
    expect(destructiveSummary(result)).toMatch(/DELETE/)
  })
})
