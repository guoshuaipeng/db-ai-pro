import { describe, expect, it } from 'vitest'
import { sqlFormatDoneToast, sqlFormatDoneTone } from './sqlFormatFeedback'

describe('sqlFormatDoneToast', () => {
  it('distinguishes selection and unchanged', () => {
    expect(sqlFormatDoneToast({ changed: true, fromSelection: false })).toBe('已格式化 SQL')
    expect(sqlFormatDoneToast({ changed: true, fromSelection: true })).toContain('选中')
    expect(sqlFormatDoneToast({ changed: false, fromSelection: false })).toContain('已是')
    expect(sqlFormatDoneToast({ changed: false, fromSelection: true })).toContain('选中')
  })
})

describe('sqlFormatDoneTone', () => {
  it('success when changed', () => {
    expect(sqlFormatDoneTone(true)).toBe('success')
    expect(sqlFormatDoneTone(false)).toBe('info')
  })
})
