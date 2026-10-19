import { describe, expect, it } from 'vitest'
import {
  applyAiWidthDelta,
  applyEditorRatioPointerDelta,
  applyWidthDelta,
} from './splitterDelta'
import { LAYOUT } from './layoutBounds'

describe('splitterDelta', () => {
  it('applies sidebar/ai width 1:1 in CSS pixels', () => {
    expect(applyWidthDelta(252, 40)).toBe(292)
    expect(applyWidthDelta(252, -1000)).toBe(LAYOUT.sidebarMin)
    expect(applyAiWidthDelta(360, -20)).toBe(340)
  })

  it('maps editor ratio so ~1px pointer ≈ 1px editor height', () => {
    const ratio = 1.35
    const track = 600
    const next = applyEditorRatioPointerDelta(ratio, 10, track)
    const height = (r: number) => (track * r) / (r + 1)
    expect(height(next) - height(ratio)).toBeGreaterThan(9)
    expect(height(next) - height(ratio)).toBeLessThan(11)
  })
})
