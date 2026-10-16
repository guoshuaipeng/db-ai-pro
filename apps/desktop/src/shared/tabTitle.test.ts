import { describe, expect, it } from 'vitest'
import { DEFAULT_TAB_TITLE, duplicateTabTitle, sanitizeTabTitle, TAB_TITLE_MAX } from './tabTitle'

describe('sanitizeTabTitle', () => {
  it('trims and collapses whitespace', () => {
    expect(sanitizeTabTitle('  客户  总览  ')).toBe('客户 总览')
  })

  it('falls back when empty', () => {
    expect(sanitizeTabTitle('')).toBe(DEFAULT_TAB_TITLE)
    expect(sanitizeTabTitle('   ', '订单')).toBe('订单')
    expect(sanitizeTabTitle('\n\t', '  ')).toBe(DEFAULT_TAB_TITLE)
  })

  it('builds duplicate titles', () => {
    expect(duplicateTabTitle('客户')).toBe('客户 副本')
    expect(duplicateTabTitle('   ')).toBe('查询 副本')
  })

  it('clamps length', () => {
    const long = '测'.repeat(TAB_TITLE_MAX + 10)
    expect(sanitizeTabTitle(long).length).toBe(TAB_TITLE_MAX)
  })
})
