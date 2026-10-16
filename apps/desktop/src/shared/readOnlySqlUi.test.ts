import { describe, expect, it } from 'vitest'
import {
  readOnlyBlockBody,
  readOnlyBlockTitle,
  resolveReadOnlyBlockSource,
} from './readOnlySqlUi'

describe('readOnlySqlUi', () => {
  it('exposes Chinese block copy', () => {
    expect(readOnlyBlockTitle('insert')).toContain('INSERT')
    expect(readOnlyBlockBody('global')).toContain('全局')
    expect(resolveReadOnlyBlockSource(true, true)).toBe('both')
    expect(resolveReadOnlyBlockSource(false, true)).toBe('connection')
  })
})
