import { describe, expect, it } from 'vitest'
import { shouldCancelRunOnEscape } from './escCancelRun'

describe('shouldCancelRunOnEscape', () => {
  it('cancels only while a query is running and no modal is open', () => {
    expect(shouldCancelRunOnEscape({ running: true, modalOpen: false })).toBe(true)
    expect(shouldCancelRunOnEscape({ running: false, modalOpen: false })).toBe(false)
    expect(shouldCancelRunOnEscape({ running: true, modalOpen: true })).toBe(false)
  })
})
