/** In-app notification center (session-scoped, not OS toasts). */

export const NOTIF_CAP = 30

export type NotifKind = 'query' | 'import' | 'health' | 'slow'

export type NotifTone = 'info' | 'error' | 'success' | 'warn'

export type AppNotification = {
  id: string
  kind: NotifKind
  tone: NotifTone
  title: string
  detail?: string
  createdAt: number
  read: boolean
}

export type NotifyPrefs = {
  notifyOnErrorOnly: boolean
  notifyOnSlowQuery: boolean
}

export function createNotification(
  input: Omit<AppNotification, 'id' | 'createdAt' | 'read'> & { id?: string; createdAt?: number },
): AppNotification {
  return {
    id: input.id?.trim() || cryptoRandomId(),
    kind: input.kind,
    tone: input.tone,
    title: input.title.trim() || '通知',
    detail: input.detail?.trim() || undefined,
    createdAt: input.createdAt ?? Date.now(),
    read: false,
  }
}

function cryptoRandomId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID()
  return `n-${Date.now()}-${Math.random().toString(16).slice(2)}`
}

export function prependNotification(
  list: AppNotification[],
  next: AppNotification,
  cap = NOTIF_CAP,
): AppNotification[] {
  return [next, ...list.filter((row) => row.id !== next.id)].slice(0, Math.max(1, cap))
}

export function markAllNotificationsRead(list: AppNotification[]): AppNotification[] {
  if (list.every((row) => row.read)) return list
  return list.map((row) => (row.read ? row : { ...row, read: true }))
}

export function unreadNotificationCount(list: AppNotification[]): number {
  return list.reduce((sum, row) => sum + (row.read ? 0 : 1), 0)
}

/** Whether this event should enter the notification center. */
export function shouldRecordNotification(
  kind: NotifKind,
  tone: NotifTone,
  prefs: NotifyPrefs,
): boolean {
  if (kind === 'slow') return prefs.notifyOnSlowQuery === true
  if (kind === 'health') return tone === 'error' || tone === 'warn'
  if (prefs.notifyOnErrorOnly) return tone === 'error' || tone === 'warn'
  return kind === 'query' || kind === 'import'
}

export function formatNotifTime(createdAt: number, now = Date.now()): string {
  const delta = Math.max(0, now - createdAt)
  if (delta < 45_000) return '刚刚'
  if (delta < 3_600_000) return `${Math.floor(delta / 60_000)} 分钟前`
  if (delta < 86_400_000) return `${Math.floor(delta / 3_600_000)} 小时前`
  const d = new Date(createdAt)
  const hh = String(d.getHours()).padStart(2, '0')
  const mm = String(d.getMinutes()).padStart(2, '0')
  return `${d.getMonth() + 1}/${d.getDate()} ${hh}:${mm}`
}

export function notifKindLabel(kind: NotifKind): string {
  switch (kind) {
    case 'query':
      return '查询'
    case 'import':
      return '导入'
    case 'health':
      return '探测'
    case 'slow':
      return '慢查询'
    default:
      return '通知'
  }
}


export type NotifKindFilter = NotifKind | 'all'

export const NOTIF_KIND_FILTERS: readonly { id: NotifKindFilter; label: string }[] = [
  { id: 'all', label: '全部' },
  { id: 'query', label: '查询' },
  { id: 'import', label: '导入' },
  { id: 'health', label: '探测' },
  { id: 'slow', label: '慢查询' },
]

/** Filter by kind chip and optional title/detail keyword. */
export function filterNotifications(
  items: readonly AppNotification[],
  kind: NotifKindFilter,
  query = '',
): AppNotification[] {
  const q = query.trim().toLowerCase()
  return items.filter((item) => {
    if (kind !== 'all' && item.kind !== kind) return false
    if (!q) return true
    const hay = `${item.title} ${item.detail ?? ''} ${notifKindLabel(item.kind)}`.toLowerCase()
    return hay.includes(q)
  })
}

export function formatNotificationClipboard(item: AppNotification): string {
  const title = item.title.trim() || '通知'
  const detail = (item.detail ?? '').trim()
  const head = `[${notifKindLabel(item.kind)}] ${title}`
  return detail ? `${head}\n${detail}` : head
}

export function notificationCopiedToast(item: AppNotification): string {
  const name = item.title.trim() || '通知'
  const clipped = name.length > 24 ? `${name.slice(0, 23)}…` : name
  return `已复制「${clipped}」`
}

export function notifFilterEmptyBody(kind: NotifKindFilter, hasQuery: boolean): string {
  if (hasQuery && kind !== 'all') {
    return '没有匹配的通知。试试更短的关键字，或切换到「全部」。'
  }
  if (hasQuery) return '没有匹配的通知。试试标题或详情中的关键字。'
  if (kind !== 'all') {
    const label = NOTIF_KIND_FILTERS.find((row) => row.id === kind)?.label ?? ''
    return `暂无「${label}」类通知。查询失败、导入与探测会出现在这里。`
  }
  return '暂无通知。查询、导入与探测失败会出现在这里。'
}
