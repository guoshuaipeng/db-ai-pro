import { describe, expect, it } from 'vitest'
import { statusBarWordWrapLabel, statusBarWordWrapTitle } from './statusBarWordWrap'

describe('statusBarWordWrap', () => {
  it('labels on/off', () => {
    expect(statusBarWordWrapLabel(true)).toBe('换行')
    expect(statusBarWordWrapLabel(false)).toContain('关')
  })

  it('titles mention Alt+Z', () => {
    expect(statusBarWordWrapTitle(true)).toContain('Alt+Z')
    expect(statusBarWordWrapTitle(false)).toContain('Alt+Z')
    expect(statusBarWordWrapTitle(false)).toContain('开启')
  })
})
