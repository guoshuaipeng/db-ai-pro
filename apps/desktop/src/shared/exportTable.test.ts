import { describe, expect, it } from 'vitest'
import { capExportRows, EXPORT_ROW_CAP, rowsToHtml, rowsToMarkdown } from './exportTable'

describe('export Markdown / HTML', () => {
  const columns = ['id', 'name']
  const rows = [
    { id: 1, name: 'a|b' },
    { id: 2, name: 'x' },
  ]

  it('builds a markdown table and escapes pipes', () => {
    const md = rowsToMarkdown(columns, rows)
    expect(md).toContain('| id | name |')
    expect(md).toContain('| --- | --- |')
    expect(md).toContain('a\\|b')
  })

  it('builds a simple html document', () => {
    const html = rowsToHtml(columns, rows, 'demo')
    expect(html).toContain('<table>')
    expect(html).toContain('<th>id</th>')
    expect(html).toContain('<td>1</td>')
    expect(html).toContain('background: #0c0e13')
  })

  it('caps export rows', () => {
    const many = Array.from({ length: 5 }, (_, i) => i)
    const capped = capExportRows(many, 3)
    expect(capped.truncated).toBe(true)
    expect(capped.rows).toEqual([0, 1, 2])
    expect(EXPORT_ROW_CAP).toBeGreaterThan(1000)
  })
})
