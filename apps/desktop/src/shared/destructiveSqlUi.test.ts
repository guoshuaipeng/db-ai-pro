import { describe, expect, it } from 'vitest'
import {
  destructiveDialogBody,
  destructiveDialogTitle,
  destructiveFootnote,
} from './destructiveSqlUi'

describe('destructiveSqlUi', () => {
  it('exposes Chinese confirm copy', () => {
    expect(destructiveDialogTitle(0)).toContain('高风险')
    expect(destructiveDialogTitle(2)).toContain('2')
    expect(destructiveDialogBody()).toContain('数据丢失')
    expect(destructiveFootnote()).toContain('Esc')
  })
})
