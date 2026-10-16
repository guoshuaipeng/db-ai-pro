import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react'

type Props = {
  /** Always visible, typically Run / Cancel — stays at the end. */
  primary: ReactNode
  /** Secondary actions; collapse into 「更多」 when the bar is too narrow. */
  secondary: ReactNode
  className?: string
}

/**
 * Flex toolbar that moves `secondary` into a 「更多」 menu when the row cannot
 * fit everything beside `primary` (e.g. AI sidebar open).
 */
export function ToolbarOverflow({ primary, secondary, className }: Props) {
  const rootRef = useRef<HTMLDivElement>(null)
  const measureRef = useRef<HTMLDivElement>(null)
  const primaryRef = useRef<HTMLDivElement>(null)
  const [collapsed, setCollapsed] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)

  const recompute = () => {
    const root = rootRef.current
    const measure = measureRef.current
    const primaryEl = primaryRef.current
    if (!root || !measure || !primaryEl) return
    const gap = 6
    const need = measure.scrollWidth + primaryEl.scrollWidth + gap
    const next = need > root.clientWidth
    setCollapsed(next)
    if (!next) setMenuOpen(false)
  }

  useLayoutEffect(() => {
    recompute()
  })

  useEffect(() => {
    const root = rootRef.current
    if (!root) return
    const ro = new ResizeObserver(() => recompute())
    ro.observe(root)
    return () => ro.disconnect()
  }, [])

  useEffect(() => {
    if (!menuOpen) return
    const close = () => setMenuOpen(false)
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') close()
    }
    window.addEventListener('mousedown', close)
    window.addEventListener('keydown', onKey, true)
    return () => {
      window.removeEventListener('mousedown', close)
      window.removeEventListener('keydown', onKey, true)
    }
  }, [menuOpen])

  return (
    <div ref={rootRef} className={className ?? 'editor-toolbar'}>
      {/* Hidden full secondary used only for width measurement */}
      <div className="toolbar-overflow-measure" ref={measureRef} aria-hidden="true">
        {secondary}
      </div>
      {!collapsed ? <div className="toolbar-overflow-secondary">{secondary}</div> : null}
      {collapsed ? (
        <div className="toolbar-overflow-more">
          <button
            type="button"
            className={menuOpen ? 'btn btn-ghost run-btn is-active' : 'btn btn-ghost run-btn'}
            aria-expanded={menuOpen}
            aria-haspopup="menu"
            title="更多编辑操作"
            onMouseDown={(event) => event.stopPropagation()}
            onClick={() => setMenuOpen((open) => !open)}
          >
            更多
          </button>
          {menuOpen && (
            <div
              className="toolbar-overflow-menu"
              role="menu"
              onMouseDown={(event) => event.stopPropagation()}
            >
              {secondary}
            </div>
          )}
        </div>
      ) : null}
      <div className="toolbar-overflow-primary" ref={primaryRef}>
        {primary}
      </div>
    </div>
  )
}