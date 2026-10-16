import { describe, expect, it } from 'vitest'
import {
  expandPersistHint,
  expandPersistStatus,
  expandRestoredToast,
} from './treeExpandPersistUi'

describe('treeExpandPersistUi', () => {
  it('exposes Chinese restore and status copy', () => {
    expect(expandRestoredToast(0)).toContain('就绪')
    expect(expandRestoredToast(3)).toContain('3')
    expect(expandPersistHint()).toContain('自动保存')
    expect(expandPersistStatus(2)).toContain('2')
  })
})
