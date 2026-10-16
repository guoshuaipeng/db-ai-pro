import { describe, expect, it } from 'vitest'
import { buildConnHealth, formatLatency, toneForLatency } from './connHealth'

describe('connHealth', () => {
  it('maps latency tones', () => {
    expect(toneForLatency(12, true)).toBe('good')
    expect(toneForLatency(120, true)).toBe('warn')
    expect(toneForLatency(400, true)).toBe('bad')
    expect(toneForLatency(10, false)).toBe('bad')
    expect(toneForLatency(0, false, true)).toBe('unsupported')
  })

  it('formats latency', () => {
    expect(formatLatency(7)).toBe('7ms')
    expect(formatLatency(1500)).toBe('1.5s')
  })

  it('builds snapshot', () => {
    const h = buildConnHealth({ ok: true, latencyMs: 42.2 })
    expect(h.tone).toBe('good')
    expect(h.latencyMs).toBe(42)
  })
})
