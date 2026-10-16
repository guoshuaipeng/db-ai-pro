import { useEffect, useRef, useState, type ReactNode } from 'react'

type TabItem = {
  id: string
  label: string
  /** Optional muted badge, e.g. disconnected connection */
  badge?: string
  tone?: 'warn' | 'muted'
}

type ScrollTabsProps = {
  label: string
  tabs: TabItem[]
  activeId: string
  onSelect: (id: string) => void
  onClose?: (id: string) => void
  trailing?: ReactNode
}

export function ScrollTabs({ label, tabs, activeId, onSelect, onClose, trailing }: ScrollTabsProps) {
  const scroller = useRef<HTMLDivElement>(null)
  const [overflow, setOverflow] = useState({ left: false, right: false })

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
          return (
            <div key={tab.id} className={selected ? 'tab is-active' : 'tab'} role="presentation">
              <button
                type="button"
                role="tab"
                data-tab={tab.id}
                className="tab-main"
                aria-selected={selected}
                title={tab.label}
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
