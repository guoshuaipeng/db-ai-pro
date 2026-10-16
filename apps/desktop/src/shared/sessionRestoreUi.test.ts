import { describe, expect, it } from 'vitest'
import {
  sessionRestoreSettingBody,
  sessionTabsRestoredToast,
  sessionTabsWereCapped,
} from './sessionRestoreUi'

describe('sessionRestoreUi', () => {
  it('exposes Chinese restore copy', () => {
    expect(sessionTabsRestoredToast(3, false)).toContain('3')
    expect(sessionTabsRestoredToast(20, true)).toContain('上限')
    expect(sessionTabsWereCapped(25, 20, 20)).toBe(true)
    expect(sessionRestoreSettingBody()).toContain('查询标签')
  })
})
