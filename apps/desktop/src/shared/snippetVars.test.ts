import { describe, expect, it } from 'vitest'
import { defaultSnippetValues, expandSnippet, extractSnippetVars, hasSnippetVars } from './snippetVars'

describe('snippetVars', () => {
  it('extracts unique vars in order', () => {
    const sql = 'SELECT * FROM {{table}} LIMIT {{limit}} -- {{table}}'
    expect(extractSnippetVars(sql)).toEqual(['table', 'limit'])
    expect(hasSnippetVars(sql)).toBe(true)
    expect(hasSnippetVars('SELECT 1')).toBe(false)
  })

  it('expands values and tolerates spaces inside braces', () => {
    const sql = 'SELECT * FROM {{ table }} WHERE id < {{limit}}'
    expect(expandSnippet(sql, { table: 'orders', limit: '10' })).toBe(
      'SELECT * FROM orders WHERE id < 10',
    )
  })

  it('defaults common vars', () => {
    expect(defaultSnippetValues(['table', 'limit', 'col'], { table: 'users' })).toEqual({
      table: 'users',
      limit: '100',
      col: '',
    })
  })
})
