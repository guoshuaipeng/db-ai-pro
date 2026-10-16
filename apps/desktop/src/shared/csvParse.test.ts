import { describe, expect, it } from 'vitest'
import { parseCsv } from './csvParse'

describe('parseCsv', () => {
  it('parses headers and rows', () => {
    const result = parseCsv('name,age\nAda,30\nLin,28\n')
    expect(result.headers).toEqual(['name', 'age'])
    expect(result.rows).toEqual([
      { name: 'Ada', age: '30' },
      { name: 'Lin', age: '28' },
    ])
  })

  it('keeps commas inside quotes', () => {
    const result = parseCsv('city,note\n"Shang,hai","ok""yes"\n')
    expect(result.rows[0]).toEqual({ city: 'Shang,hai', note: 'ok"yes' })
  })

  it('dedupes blank headers', () => {
    const result = parseCsv(',x\n1,2\n')
    expect(result.headers[0]).toBe('column_1')
    expect(result.rows[0]?.column_1).toBe('1')
  })
})
