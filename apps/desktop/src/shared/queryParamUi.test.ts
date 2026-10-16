import { describe, expect, it } from 'vitest'
import {
  clearQueryParamValues,
  countFilledParams,
  queryParamEmptyHint,
  queryParamNoVarsTitle,
  queryParamProgress,
} from './queryParamUi'

describe('queryParamUi', () => {
  it('counts filled params and builds copy', () => {
    expect(countFilledParams(['a', 'b'], { a: '1', b: '  ' })).toBe(1)
    expect(clearQueryParamValues(['x', 'y'])).toEqual({ x: '', y: '' })
    expect(queryParamProgress(1, 3)).toContain('1/3')
    expect(queryParamEmptyHint(2)).toContain('2')
    expect(queryParamEmptyHint(0)).toBe('')
    expect(queryParamNoVarsTitle()).toContain('没有')
  })
})
