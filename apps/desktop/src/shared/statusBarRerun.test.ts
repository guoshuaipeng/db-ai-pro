import { describe, expect, it } from 'vitest'
import { statusBarRerunAction, statusBarRerunTitle } from './statusBarRerun'

describe('statusBarRerun', () => {
  it('maps explain vs run', () => {
    expect(statusBarRerunAction('explain')).toBe('explain')
    expect(statusBarRerunAction('run')).toBe('run')
    expect(statusBarRerunAction(undefined)).toBe('run')
  })

  it('titles mention click', () => {
    expect(statusBarRerunTitle('explain')).toContain('执行计划')
    expect(statusBarRerunTitle('run')).toContain('再次运行')
  })
})
