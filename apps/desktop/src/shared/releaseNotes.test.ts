import { describe, expect, it } from 'vitest'
import { APP_VERSION_LABEL, RELEASE_NOTES_SNIPPET } from './releaseNotes'

describe('releaseNotes', () => {
  it('labels 1.0 RC', () => {
    expect(APP_VERSION_LABEL).toBe('1.0.0')
    expect(RELEASE_NOTES_SNIPPET.items.length).toBeGreaterThan(2)
  })
})
