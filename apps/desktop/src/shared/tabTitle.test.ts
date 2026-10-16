import { describe, expect, it } from 'vitest'
import { DEFAULT_TAB_TITLE, sanitizeTabTitle, TAB_TITLE_MAX } from './tabTitle'

describe('sanitizeTabTitle', () => {
  it('trims and collapses whitespace', () => {
    expect(sanitizeTabTitle('  客户  总览  ')).toBe('客户 总览')
  })

  it('falls back when empty', () => {
    expect(sanitizeTabTitle('')).toBe(DEFAULT_TAB_TITLE)
    expect(sanitizeTabTitle('   ', '订单')).toBe('订单')
    expect(sanitizeTabTitle('\n\t', '  ')).toBe(DEFAULT_TAB_TITLE)
  })

  it('clamps length', () => {
    const long = '测'.repeat(TAB_TITLE_MAX + 10)
    expect(sanitizeTabTitle(long).length).toBe(TAB_TITLE_MAX)
  })
})
