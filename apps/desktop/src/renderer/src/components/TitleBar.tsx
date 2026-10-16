import { useEffect, useRef, useState } from 'react'
import { getApi } from '../bridge'
import { recentQueryTitle, type RecentQueryItem, type RecentTableItem } from '@shared/recentItems'
import { IconSidebar, IconSpark, Mark } from './icons'
import { crumbRevealTitle } from '@shared/revealConnection'

type TitleBarProps = {
  crumb: string
  /** Active connection colorTag hex for crumb dot. */
  crumbColor?: string | null
  /** When set, crumb is clickable (reveal in tree). */
  onRevealCrumb?: () => void
  crumbClickable?: boolean
  version?: string
  sidebarOpen: boolean
  aiOpen: boolean
  alwaysOnTop?: boolean
  zoomLabel?: string
  onToggleSidebar: () => void
  onToggleAi: () => void
  onToggleAlwaysOnTop?: () => void
  notificationUnread?: number
  notificationsOpen?: boolean
  onOpenNotifications?: () => void
  onOpenPalette: () => void
  onOpenSettings: () => void
  onCloseWindow?: () => void
  recentTables?: RecentTableItem[]
  recentQueries?: RecentQueryItem[]
  onOpenRecentTable?: (item: RecentTableItem) => void
  onOpenRecentQuery?: (item: RecentQueryItem) => void
  onClearRecent?: () => void
}

export function TitleBar({
  crumb,
  crumbColor,
  onRevealCrumb,
  crumbClickable = false,
  version,
  sidebarOpen,
  aiOpen,
  alwaysOnTop = false,
  zoomLabel,
  onToggleSidebar,
  onToggleAi,
  onToggleAlwaysOnTop,
  notificationUnread = 0,
  notificationsOpen = false,
  onOpenNotifications,
  onOpenPalette,
  onOpenSettings,
  onCloseWindow,
  recentTables = [],
  recentQueries = [],
  onOpenRecentTable,
  onOpenRecentQuery,
  onClearRecent,
}: TitleBarProps) {
  const api = getApi()
  const [maximized, setMaximized] = useState(false)
  const [recentOpen, setRecentOpen] = useState(false)
  const recentRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    let cancelled = false
    void (async () => {
      try {
        const value = await api.window.isMaximized()
        if (!cancelled) setMaximized(value)
      } catch {
        /* preview mode has no native window */
      }
    })()
    return () => {
      cancelled = true
    }
  }, [api])

  useEffect(() => {
    if (!recentOpen) return
    const onDoc = (event: MouseEvent) => {
      if (!recentRef.current?.contains(event.target as Node)) setRecentOpen(false)
    }
    window.addEventListener('mousedown', onDoc)
    return () => window.removeEventListener('mousedown', onDoc)
  }, [recentOpen])

  const minimize = () => void api.window.minimize().catch(() => undefined)
  const toggleMax = () =>
    void api.window
      .maximize()
      .then((result) => setMaximized(Boolean(result?.maximized)))
      .catch(() => undefined)
  const close = () => {
    if (onCloseWindow) {
      onCloseWindow()
      return
    }
    void api.window.close().catch(() => undefined)
  }

  const hasRecent = recentTables.length > 0 || recentQueries.length > 0

  return (
    <header className="titlebar" onDoubleClick={toggleMax}>
      <div className="titlebar-drag">
        <div className="brand titlebar-no-drag">
          <Mark />
          <span className="word">DataAI</span>
          {version && <span className="title-version">{version}</span>}
        </div>
        {crumbClickable && onRevealCrumb ? (
          <button
            type="button"
            className="crumb crumb-btn titlebar-no-drag"
            title={crumbRevealTitle(true)}
            onClick={onRevealCrumb}
          >
            {crumbColor ? (
              <span className="crumb-conn-dot" style={{ background: crumbColor }} aria-hidden="true" />
            ) : null}
            <span className="crumb-text">{crumb}</span>
          </button>
        ) : (
          <p className="crumb" title={crumbClickable ? crumbRevealTitle(false) : crumb}>
            {crumbColor ? (
              <span className="crumb-conn-dot" style={{ background: crumbColor }} aria-hidden="true" />
            ) : null}
            {crumb}
          </p>
        )}
      </div>
      <div className="title-actions titlebar-no-drag">
        <div className="recent-menu" ref={recentRef}>
          <button
            type="button"
            className={recentOpen ? 'pill is-active' : 'pill'}
            onClick={() => setRecentOpen((open) => !open)}
            title="最近表与查询"
            aria-expanded={recentOpen}
          >
            最近
          </button>
          {recentOpen && (
            <div className="recent-popover" role="menu" aria-label="最近">
              {!hasRecent && <p className="recent-empty">暂无最近项。打开表或运行 SQL 后会出现在这里。</p>}
              {recentTables.length > 0 && (
                <div className="recent-block">
                  <div className="recent-block-head">最近表</div>
                  {recentTables.slice(0, 8).map((item) => (
                    <button
                      key={`${item.connectionId}:${item.tableName}`}
                      type="button"
                      className="recent-row"
                      role="menuitem"
                      onClick={() => {
                        onOpenRecentTable?.(item)
                        setRecentOpen(false)
                      }}
                    >
                      <span className="recent-row-title">{item.tableName}</span>
                      <span className="recent-row-sub">{item.connectionName || '连接'}</span>
                    </button>
                  ))}
                </div>
              )}
              {recentQueries.length > 0 && (
                <div className="recent-block">
                  <div className="recent-block-head">最近查询</div>
                  {recentQueries.slice(0, 8).map((item) => (
                    <button
                      key={`${item.connectionId ?? 'g'}:${item.at}:${item.sql.slice(0, 20)}`}
                      type="button"
                      className="recent-row"
                      role="menuitem"
                      title={item.sql}
                      onClick={() => {
                        onOpenRecentQuery?.(item)
                        setRecentOpen(false)
                      }}
                    >
                      <span className="recent-row-title">{recentQueryTitle(item.sql, 56)}</span>
                      <span className="recent-row-sub">{item.connectionName || '查询'}</span>
                    </button>
                  ))}
                </div>
              )}
              {hasRecent && (
                <div className="recent-foot">
                  <button
                    type="button"
                    className="tiny-btn btn btn-ghost"
                    onClick={() => {
                      onClearRecent?.()
                      setRecentOpen(false)
                    }}
                  >
                    清空
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
        {zoomLabel ? (
          <span className="title-zoom" title="界面缩放（Ctrl+= / Ctrl+- / Ctrl+0）">
            {zoomLabel}
          </span>
        ) : null}
        <button
          type="button"
          className={alwaysOnTop ? 'pill is-active' : 'pill'}
          onClick={() => onToggleAlwaysOnTop?.()}
          title={alwaysOnTop ? '取消窗口置顶' : '窗口置顶'}
          aria-pressed={alwaysOnTop}
        >
          置顶
        </button>
        <button
          type="button"
          className={notificationsOpen ? 'pill is-active notif-bell' : 'pill notif-bell'}
          onClick={() => onOpenNotifications?.()}
          title="通知中心"
          aria-pressed={notificationsOpen}
          aria-label={notificationUnread > 0 ? `通知中心，${notificationUnread} 条未读` : '通知中心'}
        >
          通知
          {notificationUnread > 0 ? (
            <span className="notif-badge">{notificationUnread > 9 ? '9+' : notificationUnread}</span>
          ) : null}
        </button>
        <button type="button" className="pill palette-trigger" onClick={onOpenPalette} title="命令 / 对象搜索 (Ctrl+K · Ctrl+P)">
          Ctrl+K
        </button>
        <button type="button" className="pill" onClick={onOpenSettings} title="设置">
          设置
        </button>
        <button
          type="button"
          className={sidebarOpen ? 'icon-btn is-active' : 'icon-btn'}
          aria-pressed={sidebarOpen}
          aria-label="连接栏"
          onClick={onToggleSidebar}
        >
          <IconSidebar />
        </button>
        <button
          type="button"
          className={aiOpen ? 'icon-btn is-active' : 'icon-btn'}
          aria-pressed={aiOpen}
          aria-label="助手"
          onClick={onToggleAi}
        >
          <IconSpark />
        </button>
        <div className="window-controls" aria-label="窗口控制">
          <button type="button" className="win-btn" aria-label="最小化" onClick={minimize}>
            <WinMin />
          </button>
          <button type="button" className="win-btn" aria-label={maximized ? '还原' : '最大化'} onClick={toggleMax}>
            {maximized ? <WinRestore /> : <WinMax />}
          </button>
          <button type="button" className="win-btn is-close" aria-label="关闭" onClick={close}>
            <WinClose />
          </button>
        </div>
      </div>
    </header>
  )
}

function WinMin() {
  return (
    <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden="true">
      <path d="M1 5h8" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
    </svg>
  )
}

function WinMax() {
  return (
    <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden="true">
      <rect x="1.5" y="1.5" width="7" height="7" rx="1" fill="none" stroke="currentColor" strokeWidth="1.2" />
    </svg>
  )
}

function WinRestore() {
  return (
    <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden="true">
      <path
        d="M3 3.2h4.2V7.5H3zM2.2 2.4h.8V1.8H7.8v4.8h-.6V7H8.5V1.2H2.2z"
        fill="currentColor"
      />
    </svg>
  )
}

function WinClose() {
  return (
    <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden="true">
      <path d="M2 2l6 6M8 2l-6 6" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
    </svg>
  )
}
