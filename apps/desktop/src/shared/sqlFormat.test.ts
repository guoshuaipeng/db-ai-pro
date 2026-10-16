import { describe, expect, it } from 'vitest'
import { formatSql } from './sqlFormat'

describe('formatSql', () => {
  it('returns empty-ish input unchanged when blank', () => {
    expect(formatSql('')).toBe('')
    expect(formatSql('   ')).toBe('   ')
  })

  it('pretty-prints a simple select', () => {
    const out = formatSql('select id,name from users where active=1 and role=\'admin\'')
    expect(out).toContain('SELECT')
    expect(out).toContain('\nFROM')
    expect(out).toContain('\nWHERE')
    expect(out).toMatch(/id,\n/)
  })

  it('preserves string contents including semicolons', () => {
    const out = formatSql("SELECT 'a;b' AS x FROM t")
    expect(out).toContain("'a;b'")
  })

  it('preserves line comments', () => {
    const out = formatSql('-- title\nSELECT 1')
    expect(out.startsWith('-- title')).toBe(true)
    expect(out).toContain('SELECT')
  })

  it('formats join clauses', () => {
    const out = formatSql('select * from a left join b on a.id=b.id where a.x=1')
    expect(out).toMatch(/LEFT JOIN/i)
    expect(out).toContain('\nON')
  })
})
