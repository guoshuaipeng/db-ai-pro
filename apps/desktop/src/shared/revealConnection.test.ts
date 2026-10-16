import { describe, expect, it } from 'vitest'
import { crumbRevealTitle, statusBarConnectionTitle } from './revealConnection'

describe('statusBarConnectionTitle', () => {
  it('mentions probe, reveal, and copy', () => {
    const title = statusBarConnectionTitle('点击探测')
    expect(title).toContain('Ctrl+单击')
    expect(title).toContain('对象树')
    expect(title).toContain('Alt+单击复制地址')
  })
})

describe('crumbRevealTitle', () => {
  it('depends on active connection', () => {
    expect(crumbRevealTitle(true)).toContain('对象树')
    expect(crumbRevealTitle(false)).toContain('未选择')
  })
})
