import { describe, expect, it } from 'vitest'
import { statusBarConnectionTitle } from './revealConnection'

describe('statusBarConnectionTitle', () => {
  it('mentions Ctrl+click reveal', () => {
    expect(statusBarConnectionTitle('点击探测')).toContain('Ctrl+单击')
    expect(statusBarConnectionTitle('点击探测')).toContain('对象树')
  })
})
