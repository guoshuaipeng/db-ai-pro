import { describe, expect, it } from 'vitest'
import { crumbRevealTitle, statusBarConnectionTitle } from './revealConnection'

describe('statusBarConnectionTitle', () => {
  it('mentions Ctrl+click reveal', () => {
    expect(statusBarConnectionTitle('点击探测')).toContain('Ctrl+单击')
    expect(statusBarConnectionTitle('点击探测')).toContain('对象树')
  })
})

describe('crumbRevealTitle', () => {
  it('explains click when connected', () => {
    expect(crumbRevealTitle(true)).toContain('对象树')
    expect(crumbRevealTitle(false)).toContain('未选择')
  })
})
