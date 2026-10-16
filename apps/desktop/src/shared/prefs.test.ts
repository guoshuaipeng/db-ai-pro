import { describe, expect, it } from 'vitest'
import { clampQueryTimeoutSec, normalizePrefs } from './prefs'

describe('normalizePrefs', () => {
  it('defaults unknown values', () => {
    expect(normalizePrefs(null).density).toBe('comfortable')
    expect(normalizePrefs({ density: 'compact' }).density).toBe('compact')
    expect(normalizePrefs({ density: 'weird' }).density).toBe('comfortable')
    expect(normalizePrefs(null).highContrast).toBe(false)
    expect(normalizePrefs({ highContrast: true }).highContrast).toBe(true)
    expect(normalizePrefs({ highContrast: 'yes' as unknown as boolean }).highContrast).toBe(false)
  })

  it('defaults and clamps query timeout', () => {
    expect(normalizePrefs(null).queryTimeoutSec).toBe(30)
    expect(normalizePrefs({ queryTimeoutSec: 0 }).queryTimeoutSec).toBe(0)
    expect(normalizePrefs({ queryTimeoutSec: 45 }).queryTimeoutSec).toBe(45)
    expect(clampQueryTimeoutSec(9999)).toBe(600)
    expect(clampQueryTimeoutSec(-3)).toBe(0)
  })
})
