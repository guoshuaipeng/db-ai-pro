import { describe, expect, it } from 'vitest'
import {
  slowQueryBannerBody,
  slowQueryNotifDetail,
  slowQueryToast,
} from './slowQueryUi'

describe('slowQueryUi', () => {
  it('exposes Chinese slow-query copy', () => {
    expect(slowQueryToast(1500, 1000, 'demo')).toContain('demo')
    expect(slowQueryNotifDetail(1500, 1000, 'demo')).toContain('demo')
    expect(slowQueryBannerBody(2500, 1000)).toContain('耗时')
  })
})
