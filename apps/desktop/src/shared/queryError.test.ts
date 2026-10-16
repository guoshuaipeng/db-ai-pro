import { describe, expect, it } from 'vitest'
import {
  formatQueryErrorClipboard,
  looksLikeQueryError,
  parseQueryErrorMessage,
  queryErrorMetaLabel,
} from './queryError'

describe('looksLikeQueryError', () => {
  it('detects common engine errors', () => {
    expect(looksLikeQueryError('ERROR: relation "x" does not exist')).toBe(true)
    expect(looksLikeQueryError('near "FROM": syntax error')).toBe(true)
    expect(looksLikeQueryError('影响 3 行')).toBe(false)
    expect(looksLikeQueryError('计划 1 · 12 行 · 3 ms')).toBe(false)
  })
})

describe('parseQueryErrorMessage', () => {
  it('extracts line and sqlstate', () => {
    const parsed = parseQueryErrorMessage(
      'ERROR: syntax error at or near "SELCT"\nLINE 2: SELCT 1\nSQLSTATE 42601',
    )
    expect(parsed.line).toBe(2)
    expect(parsed.sqlState).toBe('42601')
    expect(parsed.title).toContain('错误')
    expect(queryErrorMetaLabel(parsed)).toContain('行 2')
    expect(formatQueryErrorClipboard(parsed)).toContain('SQLSTATE 42601')
  })
})
