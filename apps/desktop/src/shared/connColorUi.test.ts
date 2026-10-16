import { describe, expect, it } from 'vitest'
import {
  connColorClearedToast,
  connColorSetToast,
  connColorTagDisplayName,
} from './connColorUi'

describe('connColorUi', () => {
  it('exposes Chinese color-tag copy', () => {
    expect(connColorTagDisplayName('blue')).toContain('蓝')
    expect(connColorSetToast('demo', 'green')).toContain('demo')
    expect(connColorClearedToast('demo')).toContain('清除')
  })
})
