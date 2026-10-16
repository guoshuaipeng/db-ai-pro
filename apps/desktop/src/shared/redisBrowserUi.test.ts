import { describe, expect, it } from 'vitest'
import {
  REDIS_SCAN_PRESETS,
  formatRedisValueClipboard,
  redisNoKeysBody,
  redisTtlLabel,
  redisTypeLabel,
  redisValueIsEmpty,
} from './redisBrowserUi'

describe('redisBrowserUi', () => {
  it('exposes presets and labels', () => {
    expect(REDIS_SCAN_PRESETS[0]).toBe('*')
    expect(redisTypeLabel('hash')).toBe('HASH')
    expect(redisTtlLabel(-1)).toBe('持久')
    expect(redisTtlLabel(30)).toContain('30s')
    expect(redisNoKeysBody('user:*')).toContain('user:*')
  })

  it('formats clipboard and empty checks', () => {
    expect(formatRedisValueClipboard({ kind: 'string', value: 'hi' })).toBe('hi')
    expect(formatRedisValueClipboard({ kind: 'list', items: ['a', 'b'] })).toBe('a\nb')
    expect(redisValueIsEmpty({ kind: 'hash', fields: [] })).toBe(true)
    expect(redisValueIsEmpty({ kind: 'string', value: 'x' })).toBe(false)
  })
})
