import { describe, expect, it } from 'vitest'
import {
  NOTIF_CAP,
  createNotification,
  formatNotifTime,
  markAllNotificationsRead,
  prependNotification,
  shouldRecordNotification,
  unreadNotificationCount,
} from './notifications'

describe('notifications', () => {
  it('caps and prepends newest first', () => {
    let list = [] as ReturnType<typeof createNotification>[]
    for (let i = 0; i < NOTIF_CAP + 5; i += 1) {
      list = prependNotification(
        list,
        createNotification({ kind: 'query', tone: 'success', title: `q${i}`, id: `id-${i}` }),
      )
    }
    expect(list).toHaveLength(NOTIF_CAP)
    expect(list[0].title).toBe(`q${NOTIF_CAP + 4}`)
  })

  it('respects error-only and slow prefs', () => {
    expect(
      shouldRecordNotification('query', 'success', { notifyOnErrorOnly: true, notifyOnSlowQuery: false }),
    ).toBe(false)
    expect(
      shouldRecordNotification('query', 'error', { notifyOnErrorOnly: true, notifyOnSlowQuery: false }),
    ).toBe(true)
    expect(
      shouldRecordNotification('import', 'success', { notifyOnErrorOnly: false, notifyOnSlowQuery: false }),
    ).toBe(true)
    expect(
      shouldRecordNotification('health', 'success', { notifyOnErrorOnly: false, notifyOnSlowQuery: false }),
    ).toBe(false)
    expect(
      shouldRecordNotification('health', 'error', { notifyOnErrorOnly: false, notifyOnSlowQuery: false }),
    ).toBe(true)
    expect(
      shouldRecordNotification('slow', 'warn', { notifyOnErrorOnly: false, notifyOnSlowQuery: true }),
    ).toBe(true)
    expect(
      shouldRecordNotification('slow', 'warn', { notifyOnErrorOnly: false, notifyOnSlowQuery: false }),
    ).toBe(false)
  })

  it('tracks unread and formats time', () => {
    const a = createNotification({ kind: 'query', tone: 'error', title: 'fail', id: 'a' })
    const b = { ...createNotification({ kind: 'import', tone: 'success', title: 'ok', id: 'b' }), read: true }
    expect(unreadNotificationCount([a, b])).toBe(1)
    expect(markAllNotificationsRead([a, b]).every((row) => row.read)).toBe(true)
    expect(formatNotifTime(Date.now() - 10_000)).toBe('刚刚')
  })
})
