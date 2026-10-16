import { describe, expect, it } from 'vitest'
import {
  NOTIF_CAP,
  createNotification,
  filterNotifications,
  formatNotifTime,
  formatNotificationClipboard,
  markAllNotificationsRead,
  notifFilterEmptyBody,
  notificationCopiedToast,
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


describe('notification filter / copy', () => {
  const rows = [
    createNotification({ kind: 'query', tone: 'error', title: 'SELECT 失败', detail: 'syntax near FROM', id: '1' }),
    createNotification({ kind: 'import', tone: 'success', title: '导入完成', detail: '120 行', id: '2' }),
    createNotification({ kind: 'slow', tone: 'warn', title: '慢查询', detail: '2100 ms', id: '3' }),
  ]

  it('filters by kind and query', () => {
    expect(filterNotifications(rows, 'import')).toHaveLength(1)
    expect(filterNotifications(rows, 'all', 'syntax')[0].id).toBe('1')
    expect(filterNotifications(rows, 'query', '导入')).toHaveLength(0)
  })

  it('clipboard and empty body', () => {
    const clip = formatNotificationClipboard(rows[0])
    expect(clip).toContain('查询')
    expect(clip).toContain('syntax')
    expect(notificationCopiedToast(rows[0])).toContain('SELECT')
    expect(notifFilterEmptyBody('slow', false)).toContain('慢查询')
    expect(notifFilterEmptyBody('all', true)).toContain('没有匹配')
  })
})
