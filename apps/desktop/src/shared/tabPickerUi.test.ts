import { describe, expect, it } from 'vitest'
import {
  tabPickerEmptyTitle,
  tabPickerFilterStatus,
  tabPickerFoot,
} from './tabPickerUi'

describe('tabPickerUi', () => {
  it('exposes Chinese empty and foot copy', () => {
    expect(tabPickerEmptyTitle()).toContain('没有')
    expect(tabPickerFoot(3, 3, false)).toContain('3')
    expect(tabPickerFoot(5, 2, true)).toContain('2')
    expect(tabPickerFilterStatus(0, 4, true)).toContain('没有')
    expect(tabPickerFilterStatus(2, 4, true)).toContain('2')
  })
})
