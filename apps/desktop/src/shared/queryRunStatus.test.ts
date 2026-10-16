import { describe, expect, it } from 'vitest'
import {
  QUERY_TIMEOUT_PRESETS,
  cancelRunButtonTitle,
  queryTimeoutPolicySummary,
  queryTimeoutPresetLabel,
  queryTimeoutSavedNote,
  runningElapsedLabel,
  softTimeoutRemainingMs,
  validateQueryTimeoutDraft,
} from './queryRunStatus'

describe('queryRunStatus', () => {
  it('exposes presets and labels', () => {
    expect(QUERY_TIMEOUT_PRESETS).toContain(0)
    expect(QUERY_TIMEOUT_PRESETS).toContain(30)
    expect(queryTimeoutPresetLabel(0)).toBe('不限制')
    expect(queryTimeoutPresetLabel(30)).toContain('30')
    expect(queryTimeoutPolicySummary(0)).toContain('不自动取消')
    expect(queryTimeoutPolicySummary(30)).toContain('30')
  })

  it('computes remaining soft timeout', () => {
    expect(softTimeoutRemainingMs(5_000, 30)).toBe(25_000)
    expect(softTimeoutRemainingMs(40_000, 30)).toBe(0)
    expect(softTimeoutRemainingMs(1_000, 0)).toBeNull()
    expect(runningElapsedLabel(1_500, 30)).toContain('执行中')
    expect(runningElapsedLabel(1_500, 30)).toContain('剩')
    expect(runningElapsedLabel(1_500, 0)).not.toContain('剩')
  })

  it('validates draft and cancel title', () => {
    expect(validateQueryTimeoutDraft('')).toBeTruthy()
    expect(validateQueryTimeoutDraft('abc')).toContain('数字')
    expect(validateQueryTimeoutDraft('30')).toBeNull()
    expect(validateQueryTimeoutDraft('0')).toBeNull()
    expect(cancelRunButtonTitle(30)).toContain('30')
    expect(cancelRunButtonTitle(0)).toContain('未设置')
    expect(queryTimeoutSavedNote(0)).toContain('关闭')
    expect(queryTimeoutSavedNote(45)).toContain('45')
  })
})
