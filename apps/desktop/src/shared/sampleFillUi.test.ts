import { describe, expect, it } from 'vitest'
import {
  SAMPLE_COUNT_PRESETS,
  clampSampleCount,
  sampleFillColumnsHint,
  sampleFillCopiedToast,
  sampleFillEmptyTitle,
  sampleFillSkippedHint,
  sampleFillTitle,
} from './sampleFillUi'

describe('sampleFillUi', () => {
  it('exposes presets and Chinese copy', () => {
    expect(SAMPLE_COUNT_PRESETS).toEqual([5, 10, 20, 50])
    expect(sampleFillTitle('orders')).toContain('orders')
    expect(sampleFillEmptyTitle()).toContain('没有')
    expect(sampleFillColumnsHint(['a', 'b'])).toContain('a、b')
    expect(sampleFillSkippedHint(['id'])).toContain('id')
    expect(sampleFillCopiedToast(5)).toContain('5')
    expect(clampSampleCount(999)).toBe(200)
    expect(clampSampleCount(0)).toBe(1)
  })
})
