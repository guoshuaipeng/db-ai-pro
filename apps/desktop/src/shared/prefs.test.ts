import { describe, expect, it } from 'vitest'
import {
  clampQueryTimeoutSec,
  clampZoomFactor,
  formatZoomPercent,
  normalizePrefs,
  stepZoomFactor,
} from './prefs'

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

  it('defaults restoreTabsOnLaunch on', () => {
    expect(normalizePrefs(null).restoreTabsOnLaunch).toBe(true)
    expect(normalizePrefs({ restoreTabsOnLaunch: false }).restoreTabsOnLaunch).toBe(false)
    expect(normalizePrefs({ restoreTabsOnLaunch: true }).restoreTabsOnLaunch).toBe(true)
  })

  it('defaults globalReadOnly off', () => {
    expect(normalizePrefs(null).globalReadOnly).toBe(false)
    expect(normalizePrefs({ globalReadOnly: true }).globalReadOnly).toBe(true)
  })

  it('defaults slowQueryMs to 1000', () => {
    expect(normalizePrefs(null).slowQueryMs).toBe(1000)
    expect(normalizePrefs({ slowQueryMs: 2500 }).slowQueryMs).toBe(2500)
  })
})

describe('window chrome prefs', () => {
  it('defaults alwaysOnTop off and zoom 100%', () => {
    expect(normalizePrefs(null).alwaysOnTop).toBe(false)
    expect(normalizePrefs({ alwaysOnTop: true }).alwaysOnTop).toBe(true)
    expect(normalizePrefs(null).zoomFactor).toBe(1)
    expect(normalizePrefs({ zoomFactor: 1.25 }).zoomFactor).toBe(1.25)
  })

  it('clamps and steps zoom', () => {
    expect(clampZoomFactor(0.1)).toBe(0.5)
    expect(clampZoomFactor(9)).toBe(2)
    expect(stepZoomFactor(1, 1)).toBe(1.1)
    expect(stepZoomFactor(1, -1)).toBe(0.9)
    expect(formatZoomPercent(1.25)).toBe('125%')
  })
})

describe('notification prefs', () => {
  it('defaults notify flags off', () => {
    expect(normalizePrefs(null).notifyOnErrorOnly).toBe(false)
    expect(normalizePrefs(null).notifyOnSlowQuery).toBe(false)
    expect(normalizePrefs({ notifyOnErrorOnly: true, notifyOnSlowQuery: true }).notifyOnErrorOnly).toBe(
      true,
    )
    expect(normalizePrefs({ notifyOnSlowQuery: true }).notifyOnSlowQuery).toBe(true)
  })
})
