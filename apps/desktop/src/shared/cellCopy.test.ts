import { describe, expect, it } from 'vitest'
import { cellCopyClickHint, cellValueCopiedNote } from './cellCopy'

describe('cellCopy', () => {
  it('note is chinese', () => {
    expect(cellValueCopiedNote()).toContain('复制')
  })

  it('hint mentions shift double-click', () => {
    expect(cellCopyClickHint(false)).toContain('Shift+双击')
    expect(cellCopyClickHint(true)).toContain('Enter')
  })
})
