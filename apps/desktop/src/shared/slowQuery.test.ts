import { describe, expect, it } from 'vitest'
import { clampSlowQueryMs, formatElapsedMs, isSlowQuery, DEFAULT_SLOW_QUERY_MS } from './slowQuery'

describe('slowQuery', () => {
  it('clamps threshold', () => {
    expect(clampSlowQueryMs(1000)).toBe(1000)
    expect(clampSlowQueryMs(10)).toBe(50)
    expect(clampSlowQueryMs(9999999)).toBe(600_000)
    expect(clampSlowQueryMs('nope')).toBe(DEFAULT_SLOW_QUERY_MS)
  })

  it('marks slow and formats', () => {
    expect(isSlowQuery(1200, 1000)).toBe(true)
    expect(isSlowQuery(200, 1000)).toBe(false)
    expect(formatElapsedMs(42)).toBe('42 ms')
    expect(formatElapsedMs(1500)).toMatch(/s/)
  })
})
