import { describe, expect, it } from 'vitest'
import { profileColumn } from './columnStats'

describe('profileColumn', () => {
  it('profiles numeric columns', () => {
    const stats = profileColumn(
      [
        { amount: 10 },
        { amount: 30 },
        { amount: null },
        { amount: 20 },
      ],
      'amount',
    )
    expect(stats.count).toBe(4)
    expect(stats.nulls).toBe(1)
    expect(stats.distinct).toBe(3)
    expect(stats.numeric).toBe(true)
    expect(stats.min).toBe('10')
    expect(stats.max).toBe('30')
  })

  it('profiles text samples', () => {
    const stats = profileColumn([{ city: '上海' }, { city: '北京' }, { city: '上海' }], 'city')
    expect(stats.numeric).toBe(false)
    expect(stats.distinct).toBe(2)
    expect(stats.samples).toEqual(expect.arrayContaining(['上海', '北京']))
  })
})
