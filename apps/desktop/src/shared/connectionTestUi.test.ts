import { describe, expect, it } from 'vitest'
import {
  connectionTestButtonLabel,
  connectionTestFailBody,
  connectionTestSuccessToast,
} from './connectionTestUi'

describe('connectionTestUi', () => {
  it('exposes Chinese probe copy', () => {
    expect(connectionTestButtonLabel(true)).toContain('测试中')
    expect(connectionTestSuccessToast('MySQL')).toContain('MySQL')
    expect(connectionTestFailBody('timeout')).toContain('timeout')
  })
})
