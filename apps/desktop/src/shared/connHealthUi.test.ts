import { describe, expect, it } from 'vitest'
import { buildConnHealth } from './connHealth'
import {
  healthBadgeIdleLabel,
  healthProbeBatchToast,
  healthProbeOkToast,
} from './connHealthUi'

describe('connHealthUi', () => {
  it('exposes Chinese probe copy', () => {
    expect(healthBadgeIdleLabel()).toContain('未测')
    expect(healthProbeOkToast('demo', 42)).toContain('demo')
    expect(
      healthProbeBatchToast({ total: 3, ok: 2, bad: 1, unsupported: 0 }),
    ).toContain('失败')
    expect(buildConnHealth({ ok: true, latencyMs: 1 }).ok).toBe(true)
  })
})
