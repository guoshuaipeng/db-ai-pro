import { describe, expect, it } from 'vitest'
import { nextDuplicateConnectionName } from './duplicateConnection'

describe('nextDuplicateConnectionName', () => {
  it('appends 副本', () => {
    expect(nextDuplicateConnectionName('生产库', ['生产库'])).toBe('生产库 副本')
  })

  it('increments when 副本 taken', () => {
    expect(nextDuplicateConnectionName('生产库', ['生产库', '生产库 副本'])).toBe('生产库 副本 2')
    expect(nextDuplicateConnectionName('生产库', ['生产库', '生产库 副本', '生产库 副本 2'])).toBe(
      '生产库 副本 3',
    )
  })

  it('falls back for blank name', () => {
    expect(nextDuplicateConnectionName('  ', [])).toBe('连接 副本')
  })
})
