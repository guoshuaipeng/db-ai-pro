import { useEffect, useState } from 'react'
import { getApi } from '../bridge'
import { IconSidebar, IconSpark, Mark } from './icons'

type TitleBarProps = {
  crumb: string
  version?: string
  sidebarOpen: boolean
  aiOpen: boolean
  onToggleSidebar: () => void
  onToggleAi: () => void
  onOpenPalette: () => void
  onOpenSettings: () => void
}

export function TitleBar({
  crumb,
  version,
  sidebarOpen,
  aiOpen,
  onToggleSidebar,
  onToggleAi,
  onOpenPalette,
  onOpenSettings,
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
  const close = () => void api.window.close().catch(() => undefined)

  return (
    <header className="titlebar" onDoubleClick={toggleMax}>
      <div className="titlebar-drag">
        <div className="brand titlebar-no-drag">
          <Mark />
          <span className="word">DataAI</span>
          {version && <span className="title-version">{version}</span>}
        </div>
        <p className="crumb" title={crumb}>
          {crumb}
        </p>
      </div>
      <div className="title-actions titlebar-no-drag">
        <button type="button" className="pill palette-trigger" onClick={onOpenPalette} title="命令面板 (Ctrl+K)">
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
