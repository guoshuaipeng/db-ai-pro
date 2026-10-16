import { describe, expect, it } from 'vitest'
import { buildConnHealth } from './connHealth'
import {
  statusBarConnectionTitle,
  statusBarDisconnectedLabel,
  statusBarDisconnectedTitle,
  statusBarEndpointSummary,
  statusHealthView,
} from './statusBar'

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

describe('statusBarEndpointSummary', () => {
  it('summarizes sqlite file basename', () => {
    expect(
      statusBarEndpointSummary({ dialect: 'sqlite', filePath: 'E:\\data\\retail.db' }),
    ).toBe('retail.db')
  })

  it('summarizes host:port/db', () => {
    expect(
      statusBarEndpointSummary({
        dialect: 'mysql',
        host: '10.0.0.8',
        port: 3306,
        database: 'retail',
      }),
    ).toBe('10.0.0.8:3306/retail')
  })

  it('builds connection title with copy hint', () => {
    const title = statusBarConnectionTitle('延迟 12ms', '10.0.0.8:3306')
    expect(title).toContain('Alt+单击复制地址')
    expect(title).toContain('10.0.0.8:3306')
    expect(statusBarDisconnectedLabel()).toBe('未连接')
    expect(statusBarDisconnectedTitle()).toContain('新建连接')
  })
})
