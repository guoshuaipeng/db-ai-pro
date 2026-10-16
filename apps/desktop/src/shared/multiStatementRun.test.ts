import { describe, expect, it } from 'vitest'
import {
  multiRunFailureToast,
  multiRunMessagesTabTitle,
  multiRunNotificationDetail,
  multiRunSuccessToast,
  runSqlButtonLabel,
  runSqlButtonTitle,
  summarizeMultiRun,
} from './multiStatementRun'

describe('multiStatementRun', () => {
  it('labels the run button for multi-statement buffers', () => {
    expect(runSqlButtonLabel(1)).toBe('运行')
    expect(runSqlButtonLabel(3)).toBe('运行 3 条')
    expect(runSqlButtonTitle(3)).toContain('3')
  })

  it('summarizes batch results', () => {
    const stats = summarizeMultiRun([
      { ok: true, elapsedMs: 10, rows: [1, 2] },
      { ok: false, elapsedMs: 5 },
      { ok: true, elapsedMs: 7, rows: [] },
    ])
    expect(stats).toEqual({ total: 3, ok: 2, failed: 1, elapsedMs: 22, rowCount: 2 })
    expect(multiRunSuccessToast({ total: 3, ok: 3, failed: 0, elapsedMs: 40, rowCount: 0 })).toContain('3 条')
    expect(multiRunFailureToast(stats, 'syntax')).toContain('1 条失败')
    expect(multiRunMessagesTabTitle(3, 1)).toContain('3 条语句')
    expect(multiRunNotificationDetail(stats, '本地库')).toContain('2/3')
  })
})
