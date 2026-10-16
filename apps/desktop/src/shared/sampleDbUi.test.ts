import { describe, expect, it } from 'vitest'
import {
  sampleDbEmptyActionLabel,
  sampleDbRestoreSuccessToast,
} from './sampleDbUi'

describe('sampleDbUi', () => {
  it('exposes Chinese sample-db copy', () => {
    expect(sampleDbRestoreSuccessToast('Retail')).toContain('Retail')
    expect(sampleDbEmptyActionLabel()).toContain('示例')
  })
})
