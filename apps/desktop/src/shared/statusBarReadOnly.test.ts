import { describe, expect, it } from 'vitest'
import { statusBarReadOnlyLabel, statusBarReadOnlyTitle } from './statusBarReadOnly'

describe('statusBarReadOnlyLabel', () => {
  it('maps active state', () => {
    expect(statusBarReadOnlyLabel(true)).toBe('只读')
    expect(statusBarReadOnlyLabel(false)).toBe('可写')
  })
})

describe('statusBarReadOnlyTitle', () => {
  it('mentions click toggle for writable', () => {
    const title = statusBarReadOnlyTitle({
      readOnlyActive: false,
      globalReadOnly: false,
      connectionReadOnly: false,
    })
    expect(title).toContain('可写')
    expect(title).toContain('单击')
  })

  it('explains global on', () => {
    expect(
      statusBarReadOnlyTitle({
        readOnlyActive: true,
        globalReadOnly: true,
        connectionReadOnly: false,
      }),
    ).toContain('关闭')
  })

  it('explains connection-only', () => {
    expect(
      statusBarReadOnlyTitle({
        readOnlyActive: true,
        globalReadOnly: false,
        connectionReadOnly: true,
      }),
    ).toContain('连接')
  })
})
