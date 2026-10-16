import { useEffect, useMemo, useRef, useState } from 'react'
import {
  NOTIF_KIND_FILTERS,
  filterNotifications,
  formatNotifTime,
  formatNotificationClipboard,
  notifFilterEmptyBody,
  notifKindLabel,
  notificationCopiedToast,
  type AppNotification,
  type NotifKindFilter,
} from '@shared/notifications'
import { EmptyState } from './EmptyState'

type NotificationDrawerProps = {
  open: boolean
  items: AppNotification[]
  onClose: () => void
  onClear: () => void
  onDismiss: (id: string) => void
  onToast?: (tone: 'info' | 'error' | 'success', text: string) => void
}

export function NotificationDrawer({
  open,
  items,
  onClose,
  onClear,
  onDismiss,
  onToast,
}: NotificationDrawerProps) {
  const panelRef = useRef<HTMLDivElement>(null)
  const [kind, setKind] = useState<NotifKindFilter>('all')
  const [query, setQuery] = useState('')

  const filtered = useMemo(() => filterNotifications(items, kind, query), [items, kind, query])

  useEffect(() => {
    if (!open) {
      setKind('all')
      setQuery('')
      return
    }
    const onDoc = (event: MouseEvent) => {
      if (!panelRef.current?.contains(event.target as Node)) onClose()
    }
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      event.preventDefault()
      if (query.trim()) {
        setQuery('')
        return
      }
      if (kind !== 'all') {
        setKind('all')
        return
      }
      onClose()
    }
    window.addEventListener('mousedown', onDoc)
    window.addEventListener('keydown', onKey, true)
    return () => {
      window.removeEventListener('mousedown', onDoc)
      window.removeEventListener('keydown', onKey, true)
    }
  }, [open, onClose, query, kind])

  if (!open) return null

  const copyItem = (item: AppNotification) => {
    const text = formatNotificationClipboard(item)
    void navigator.clipboard.writeText(text).then(
      () => onToast?.('success', notificationCopiedToast(item)),
      () => onToast?.('error', '复制失败'),
    )
  }

  return (
    <div className="notif-drawer-root" ref={panelRef}>
      <div className="notif-drawer" role="dialog" aria-label="通知中心">
        <div className="notif-drawer-head">
          <strong>通知</strong>
          <div className="notif-drawer-actions">
            <button type="button" className="btn btn-ghost tiny-btn" onClick={onClear} disabled={items.length === 0}>
              清空
            </button>
            <button type="button" className="btn btn-ghost tiny-btn" onClick={onClose} aria-label="关闭通知">
              关闭
            </button>
          </div>
        </div>

        {items.length > 0 ? (
          <div className="notif-toolbar">
            <div className="notif-kinds" role="tablist" aria-label="通知类型">
              {NOTIF_KIND_FILTERS.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  role="tab"
                  aria-selected={kind === item.id}
                  className={kind === item.id ? 'notif-kind is-active' : 'notif-kind'}
                  onClick={() => setKind(item.id)}
                >
                  {item.label}
                </button>
              ))}
            </div>
            <label className="history-filter notif-filter">
              <span className="history-filter-label">筛选</span>
              <input
                className="history-filter-input"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="标题 / 详情…"
                aria-label="筛选通知"
                spellCheck={false}
              />
              {query.trim() ? (
                <span className="history-filter-count">
                  {filtered.length}/{items.length}
                </span>
              ) : (
                <span className="history-filter-count">
                  {filtered.length}/{items.length}
                </span>
              )}
              {query.trim() ? (
                <button type="button" className="btn btn-ghost tiny-btn" onClick={() => setQuery('')}>
                  清除
                </button>
              ) : null}
            </label>
          </div>
        ) : null}

        {items.length === 0 ? (
          <EmptyState
            compact
            kicker="通知中心"
            title="暂无通知"
            body={notifFilterEmptyBody('all', false)}
          />
        ) : filtered.length === 0 ? (
          <EmptyState
            compact
            kicker="通知中心"
            title="没有匹配的通知"
            body={notifFilterEmptyBody(kind, Boolean(query.trim()))}
            actions={
              <>
                {kind !== 'all' ? (
                  <button type="button" className="btn btn-ghost" onClick={() => setKind('all')}>
                    查看全部类型
                  </button>
                ) : null}
                {query.trim() ? (
                  <button type="button" className="btn btn-ghost" onClick={() => setQuery('')}>
                    清除筛选
                  </button>
                ) : null}
              </>
            }
          />
        ) : (
          <ul className="notif-list">
            {filtered.map((item) => (
              <li key={item.id} className={item.read ? 'notif-item is-read' : 'notif-item'}>
                <div className="notif-item-top">
                  <span className={`notif-tone is-${item.tone}`}>{notifKindLabel(item.kind)}</span>
                  <span className="notif-time">{formatNotifTime(item.createdAt)}</span>
                  <button
                    type="button"
                    className="btn btn-ghost tiny-btn notif-copy"
                    onClick={() => copyItem(item)}
                    title="复制标题与详情"
                  >
                    复制
                  </button>
                  <button
                    type="button"
                    className="notif-dismiss"
                    aria-label="移除"
                    onClick={() => onDismiss(item.id)}
                  >
                    ×
                  </button>
                </div>
                <div className="notif-title">{item.title}</div>
                {item.detail ? <div className="notif-detail">{item.detail}</div> : null}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}
