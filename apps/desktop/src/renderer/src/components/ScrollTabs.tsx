import { useEffect, useRef, useState, type ReactNode } from 'react'

type TabItem = {
  id: string
  label: string
  /** Optional muted badge, e.g. disconnected connection */
  badge?: string
  tone?: 'warn' | 'muted'
  pinned?: boolean
}

export type TabContextAction = 'pin' | 'unpin' | 'close' | 'close-others' | 'close-right'

type ScrollTabsProps = {
  label: string
  tabs: TabItem[]
  activeId: string
  onSelect: (id: string) => void
  onClose?: (id: string) => void
  onContextAction?: (id: string, action: TabContextAction) => void
  trailing?: ReactNode
}

type MenuState = { id: string; x: number; y: number } | null

export function ScrollTabs({
  label,
  tabs,
  activeId,
  onSelect,
  onClose,
  onContextAction,
  trailing,
}: ScrollTabsProps) {
  const scroller = useRef<HTMLDivElement>(null)
  const [overflow, setOverflow] = useState({ left: false, right: false })
  const [menu, setMenu] = useState<MenuState>(null)

  const measure = () => {
    const el = scroller.current
    if (!el) return
    setOverflow({
      left: el.scrollLeft > 2,
      right: el.scrollLeft + el.clientWidth < el.scrollWidth - 2,
    })
  }

  useEffect(() => {
    measure()
    const el = scroller.current
    if (!el) return
    const observer = new ResizeObserver(measure)
    observer.observe(el)
    el.addEventListener('scroll', measure, { passive: true })
    const onWheel = (event: WheelEvent) => {
      if (el.scrollWidth <= el.clientWidth) return
      if (Math.abs(event.deltaY) <= Math.abs(event.deltaX)) return
      event.preventDefault()
      el.scrollLeft += event.deltaY
    }
    el.addEventListener('wheel', onWheel, { passive: false })
    return () => {
      observer.disconnect()
      el.removeEventListener('scroll', measure)
      el.removeEventListener('wheel', onWheel)
    }
  }, [tabs])

  useEffect(() => {
    const el = scroller.current?.querySelector<HTMLElement>('[aria-selected="true"]')
    el?.scrollIntoView({ inline: 'nearest', block: 'nearest' })
  }, [activeId, tabs.length])

  useEffect(() => {
    if (!menu) return
    const close = () => setMenu(null)
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault()
        close()
      }
    }
    window.addEventListener('mousedown', close)
    window.addEventListener('keydown', onKey, true)
    return () => {
      window.removeEventListener('mousedown', close)
      window.removeEventListener('keydown', onKey, true)
    }
  }, [menu])

  const move = (direction: -1 | 1) => {
    const el = scroller.current
    if (!el) return
    el.scrollBy({ left: direction * 220, behavior: 'smooth' })
  }

  const focusSibling = (current: string, direction: -1 | 1) => {
    const index = tabs.findIndex((tab) => tab.id === current)
    const next = tabs[index + direction]
    if (!next) return
    onSelect(next.id)
    queueMicrotask(() => {
      scroller.current?.querySelector<HTMLElement>(`[data-tab="${next.id}"]`)?.focus()
    })
  }

  const runAction = (id: string, action: TabContextAction) => {
    setMenu(null)
    onContextAction?.(id, action)
  }

  const menuTab = menu ? tabs.find((tab) => tab.id === menu.id) : null
  const hasOverflow = overflow.left || overflow.right

  return (
    <div className="tabstrip">
      {hasOverflow && (
        <button type="button" className="tab-nav" aria-label="向左滚动标签" disabled={!overflow.left} onClick={() => move(-1)}>
          <Chevron direction="left" />
        </button>
      )}
      <div
        ref={scroller}
        className="tabstrip-scroll"
        role="tablist"
        aria-label={label}
        data-fade-left={overflow.left}
        data-fade-right={overflow.right}
      >
        {tabs.map((tab) => {
          const selected = tab.id === activeId
          const tabClass = [
            'tab',
            selected ? 'is-active' : '',
            tab.pinned ? 'is-pinned' : '',
          ]
            .filter(Boolean)
            .join(' ')
          return (
            <div
              key={tab.id}
              className={tabClass}
              role="presentation"
              onContextMenu={(event) => {
                if (!onContextAction) return
                event.preventDefault()
                onSelect(tab.id)
                setMenu({ id: tab.id, x: event.clientX, y: event.clientY })
              }}
            >
              <button
                type="button"
                role="tab"
                data-tab={tab.id}
                className="tab-main"
                aria-selected={selected}
                title={tab.pinned ? `${tab.label}（已固定）` : tab.label}
                onClick={() => onSelect(tab.id)}
                onKeyDown={(event) => {
                  if (event.key === 'ArrowRight') {
                    event.preventDefault()
                    focusSibling(tab.id, 1)
                  }
                  if (event.key === 'ArrowLeft') {
                    event.preventDefault()
                    focusSibling(tab.id, -1)
                  }
                }}
              >
                {tab.pinned && (
                  <span className="tab-pin" aria-hidden="true">
                    <PinIcon />
                  </span>
                )}
                <span className="tab-label">{tab.label}</span>
                {tab.badge && (
                  <span className={tab.tone === 'warn' ? 'tab-badge is-warn' : 'tab-badge'}>{tab.badge}</span>
                )}
              </button>
              {onClose && (
                <button
                  type="button"
                  className="tab-close"
                  aria-label={`关闭${tab.label}`}
                  onClick={() => onClose(tab.id)}
                >
                  <CloseIcon />
                </button>
              )}
            </div>
          )
        })}
      </div>
      {hasOverflow && (
        <button type="button" className="tab-nav" aria-label="向右滚动标签" disabled={!overflow.right} onClick={() => move(1)}>
          <Chevron direction="right" />
        </button>
      )}
      {trailing}
      {menu && menuTab && onContextAction && (
        <div
          className="tab-context-menu"
          role="menu"
          style={{ left: menu.x, top: menu.y }}
          onMouseDown={(event) => event.stopPropagation()}
        >
          <button
            type="button"
            role="menuitem"
            onClick={() => runAction(menuTab.id, menuTab.pinned ? 'unpin' : 'pin')}
          >
            {menuTab.pinned ? '取消固定' : '固定'}
          </button>
          {onClose && (
            <button type="button" role="menuitem" onClick={() => runAction(menuTab.id, 'close')}>
              关闭
            </button>
          )}
          <button type="button" role="menuitem" onClick={() => runAction(menuTab.id, 'close-others')}>
            关闭其他
          </button>
          <button type="button" role="menuitem" onClick={() => runAction(menuTab.id, 'close-right')}>
            关闭右侧
          </button>
        </div>
      )}
    </div>
  )
}

function Chevron({ direction }: { direction: 'left' | 'right' }) {
  const d = direction === 'left' ? 'M10 3.5 5.5 8 10 12.5' : 'M6 3.5 10.5 8 6 12.5'
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">
      <path d={d} fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

function CloseIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" aria-hidden="true">
      <path d="M4.5 4.5 11.5 11.5M11.5 4.5 4.5 11.5" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  )
}

function PinIcon() {
  return (
    <svg width="11" height="11" viewBox="0 0 16 16" aria-hidden="true">
      <path
        d="M8.2 1.8 10.8 4.4c.4.4.4 1 0 1.4l-.6.6 2.1 2.1-.9.9-2.1-2.1-.6.6c-.4.4-1 .4-1.4 0L4.7 5.3 3 7 2.2 6.2 8.2 1.8Z"
        fill="currentColor"
      />
      <path d="M6.2 9.2 3.4 14.2" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
    </svg>
  )
}
