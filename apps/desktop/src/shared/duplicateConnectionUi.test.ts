import { describe, expect, it } from 'vitest'
import {
  duplicateConnectionMenuTitle,
  duplicateConnectionSuccessToast,
} from './duplicateConnectionUi'

describe('duplicateConnectionUi', () => {
  it('exposes Chinese duplicate copy', () => {
    expect(duplicateConnectionSuccessToast('demo 副本')).toContain('demo')
    expect(duplicateConnectionMenuTitle()).toContain('编辑')
  })
})
