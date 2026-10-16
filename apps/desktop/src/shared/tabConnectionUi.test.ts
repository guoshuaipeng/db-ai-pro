import { describe, expect, it } from 'vitest'
import {
  tabConnectionBoundToast,
  tabConnectionDisconnectedHint,
  tabConnectionEmptyTitle,
} from './tabConnectionUi'
import type { ConnectionPublic } from './types'

const base = (
  partial: Partial<ConnectionPublic> & Pick<ConnectionPublic, 'id' | 'name' | 'dialect'>,
): ConnectionPublic => ({
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
  hasPassword: false,
  ...partial,
})

describe('tabConnectionUi', () => {
  it('exposes Chinese binding copy', () => {
    expect(tabConnectionEmptyTitle()).toContain('没有')
    expect(tabConnectionDisconnectedHint('demo')).toContain('demo')
    expect(tabConnectionBoundToast(base({ id: '1', name: 'local', dialect: 'sqlite' }))).toContain(
      'local',
    )
  })
})
