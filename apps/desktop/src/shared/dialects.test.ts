import { describe, expect, it } from 'vitest'
import { dialectInfo, needsServerDatabase } from './types'

describe('dialects m5', () => {
  it('marks sqlserver executable and needing database', () => {
    expect(dialectInfo('sqlserver').executable).toBe(true)
    expect(needsServerDatabase('sqlserver')).toBe(true)
  })

  it('keeps oracle/hive as stubs', () => {
    expect(dialectInfo('oracle').executable).toBe(false)
    expect(dialectInfo('hive').executable).toBe(false)
  })
})
