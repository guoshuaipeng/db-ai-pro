import { describe, expect, it } from 'vitest'
import {
  buildQueryParamDefaults,
  rememberQueryParamValues,
  sqlNeedsQueryParams,
} from './queryParams'

describe('queryParams', () => {
  it('detects {{vars}}', () => {
    expect(sqlNeedsQueryParams('SELECT * FROM {{table}}')).toBe(true)
    expect(sqlNeedsQueryParams('SELECT 1')).toBe(false)
  })

  it('prefers session values over defaults', () => {
    expect(
      buildQueryParamDefaults('SELECT * FROM {{table}} LIMIT {{limit}}', { table: 'orders' }, { table: 'users' }),
    ).toEqual({ table: 'orders', limit: '100' })
  })

  it('remembers non-empty values', () => {
    expect(rememberQueryParamValues({ a: '1' }, { a: '', b: 'x' })).toEqual({ a: '1', b: 'x' })
  })
})
