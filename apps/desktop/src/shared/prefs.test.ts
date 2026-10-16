import { describe, expect, it } from 'vitest'
import { normalizePrefs } from './prefs'

describe('normalizePrefs', () => {
  it('defaults unknown values', () => {
    expect(normalizePrefs(null).density).toBe('comfortable')
    expect(normalizePrefs({ density: 'compact' }).density).toBe('compact')
    expect(normalizePrefs({ density: 'weird' }).density).toBe('comfortable')
  })
})
