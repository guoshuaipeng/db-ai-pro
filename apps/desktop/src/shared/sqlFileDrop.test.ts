import { describe, expect, it } from 'vitest'
import { countRejectedDropFiles,
  filterSqlDropFileNames, isLikelySqlFileName, isOsFileDrag } from './sqlFileDrop'

describe('sqlFileDrop', () => {
  it('detects Files drag type', () => {
    expect(isOsFileDrag(['Files', 'text/plain'])).toBe(true)
    expect(isOsFileDrag(['text/plain'])).toBe(false)
  })

  it('filters sql/txt names', () => {
    expect(isLikelySqlFileName('a.SQL')).toBe(true)
    expect(isLikelySqlFileName('notes.txt')).toBe(true)
    expect(isLikelySqlFileName('dump.bin')).toBe(false)
    expect(filterSqlDropFileNames(['a.sql', 'x.png', 'b.txt'])).toEqual(['a.sql', 'b.txt'])
  })
})

describe('countRejectedDropFiles', () => {
  it('counts non sql/txt names', () => {
    expect(countRejectedDropFiles(['a.sql', 'b.bin', 'c.txt'])).toBe(1)
  })
})
