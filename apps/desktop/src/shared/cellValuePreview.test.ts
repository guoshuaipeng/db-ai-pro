import { describe, expect, it } from 'vitest'
import { buildCellPreview, cellPreviewTitle } from './cellValuePreview'

describe('cellValuePreview', () => {
  it('marks null', () => {
    expect(buildCellPreview(null)).toEqual({ text: 'NULL', jsonPretty: false, isNull: true })
  })

  it('pretty-prints JSON strings', () => {
    const result = buildCellPreview('{"a":1,"b":[2]}')
    expect(result.jsonPretty).toBe(true)
    expect(result.text).toContain('\n')
    expect(result.text).toContain('"a"')
  })

  it('leaves plain text alone', () => {
    expect(buildCellPreview('hello').jsonPretty).toBe(false)
    expect(buildCellPreview('hello').text).toBe('hello')
  })

  it('pretty-prints objects', () => {
    expect(buildCellPreview({ x: 1 }).jsonPretty).toBe(true)
  })

  it('titles with 1-based row', () => {
    expect(cellPreviewTitle('name', 0)).toBe('单元格 · name · 第 1 行')
  })
})
