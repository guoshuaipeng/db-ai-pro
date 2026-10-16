import { describe, expect, it } from 'vitest'
import { clampGotoLineTarget, formatGotoLineSeed, parseGotoLineInput } from './gotoLine'

describe('parseGotoLineInput', () => {
  it('parses line only', () => {
    expect(parseGotoLineInput('12')).toEqual({ line: 12, column: 1 })
  })

  it('parses line:column variants', () => {
    expect(parseGotoLineInput('12:5')).toEqual({ line: 12, column: 5 })
    expect(parseGotoLineInput('12,5')).toEqual({ line: 12, column: 5 })
    expect(parseGotoLineInput('12，5')).toEqual({ line: 12, column: 5 })
    expect(parseGotoLineInput('12 5')).toEqual({ line: 12, column: 5 })
  })

  it('rejects empty and garbage', () => {
    expect(parseGotoLineInput('')).toBeNull()
    expect(parseGotoLineInput('abc')).toBeNull()
    expect(parseGotoLineInput('0')).toBeNull()
    expect(parseGotoLineInput('-1:2')).toBeNull()
  })
})

describe('clampGotoLineTarget', () => {
  it('clamps line and column to model bounds', () => {
    expect(
      clampGotoLineTarget({ line: 99, column: 40 }, 10, (line) => (line === 10 ? 8 : 20)),
    ).toEqual({ line: 10, column: 8 })
  })
})

describe('formatGotoLineSeed', () => {
  it('omits column when 1', () => {
    expect(formatGotoLineSeed(3, 1)).toBe('3')
    expect(formatGotoLineSeed(3, 7)).toBe('3:7')
  })
})
