import { useEffect, useRef } from 'react'
import {
  formatNotifTime,
  notifKindLabel,
  type AppNotification,
} from '@shared/notifications'

type NotificationDrawerProps = {
  open: boolean
  items: AppNotification[]
  onClose: () => void
  onClear: () => void
  onDismiss: (id: string) => void
}

export function NotificationDrawer({
  open,
  items,
  onClose,
  onClear,
  onDismiss,
}: NotificationDrawerProps) {
  const panelRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const onDoc = (event: MouseEvent) => {
      if (!panelRef.current?.contains(event.target as Node)) onClose()
    }
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('mousedown', onDoc)
    window.addEventListener('keydown', onKey, true)
    return () => {
      window.removeEventListener('mousedown', onDoc)
      window.removeEventListener('keydown', onKey, true)
    }
  }, [open, onClose])

  if (!open) return null

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
        {items.length === 0 ? (
          <p className="notif-empty">暂无通知。查询、导入与探测失败会出现在这里。</p>
        ) : (
          <ul className="notif-list">
            {items.map((item) => (
              <li key={item.id} className={item.read ? 'notif-item is-read' : 'notif-item'}>
                <div className="notif-item-top">
                  <span className={`notif-tone is-${item.tone}`}>{notifKindLabel(item.kind)}</span>
                  <span className="notif-time">{formatNotifTime(item.createdAt)}</span>
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
