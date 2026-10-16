import { describe, expect, it } from 'vitest'
import { buildConnHealth } from './connHealth'
import { statusHealthView } from './statusBar'

describe('statusHealthView', () => {
  it('prompts probe when unchecked', () => {
    expect(statusHealthView(undefined)).toMatchObject({ text: '点击探测', tone: 'idle' })
  })

  it('shows latency when healthy', () => {
    const health = buildConnHealth({ ok: true, latencyMs: 42 })
    expect(statusHealthView(health)).toMatchObject({ text: '42ms', tone: 'good' })
  })

  it('shows failure / unsupported', () => {
    expect(statusHealthView(buildConnHealth({ ok: false, latencyMs: 0, error: 'timeout' })).tone).toBe('bad')
    expect(
      statusHealthView(buildConnHealth({ ok: false, latencyMs: 0, unsupported: true })).tone,
    ).toBe('unsupported')
  })
})