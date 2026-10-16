import { useEffect, useState } from 'react'
import { getApi } from '../bridge'
import type { RecentQueryItem, RecentTableItem } from '@shared/recentItems'
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
  onToast?: (tone: 'info' | 'error' | 'success', text: string) => void
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
}: TitleBarProps) {
  const api = getApi()
  const [maximized, setMaximized] = useState(false)

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
        {/* Bugfix: 最近入口已移除 */}
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
