import { describe, expect, it } from 'vitest'
import {
  cellClipboardText,
  cellDisplayHint,
  cellDisplayKind,
  formatCellDisplay,
} from './cellDisplay'

describe('cellDisplay', () => {
  it('classifies null / empty / value', () => {
    expect(cellDisplayKind(null)).toBe('null')
    expect(cellDisplayKind(undefined)).toBe('null')
    expect(cellDisplayKind('')).toBe('empty')
    expect(cellDisplayKind('x')).toBe('value')
    expect(cellDisplayKind(0)).toBe('value')
  })

  it('formats markers for the grid', () => {
    expect(formatCellDisplay(null)).toBe('NULL')
    expect(formatCellDisplay('')).toBe('""')
    expect(formatCellDisplay('hi')).toBe('hi')
  })

  it('hints and clipboard', () => {
    expect(cellDisplayHint(null)).toContain('NULL')
    expect(cellDisplayHint('')).toContain('空字符串')
    expect(cellClipboardText(null)).toBe('')
    expect(cellClipboardText('')).toBe('')
    expect(cellClipboardText('a')).toBe('a')
  })
})

