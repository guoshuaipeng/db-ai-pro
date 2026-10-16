import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import {
  toolbarMoreAria,
  toolbarMoreLabel,
  toolbarMoreTitle,
  toolbarOverflowEmptyBody,
  toolbarOverflowEmptyTitle,
  toolbarOverflowMenuBody,
  toolbarOverflowMenuKicker,
  toolbarOverflowMenuTitle,
} from '@shared/toolbarOverflowUi'
import { EmptyState } from './EmptyState'

function countToolbarActions(root: ParentNode | null | undefined): number {
  if (!root) return 0
  const nodes = root.querySelectorAll('button, [role="button"], a[href]')
  let count = 0
  nodes.forEach((node) => {
    if (!(node instanceof HTMLElement)) return
    if (node.hasAttribute('disabled')) return
    count += 1
  })
  return count
}

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
  const [actionCount, setActionCount] = useState(0)

  const recompute = () => {
    const root = rootRef.current
    const measure = measureRef.current
    const primaryEl = primaryRef.current
    if (!root || !measure || !primaryEl) return
    const gap = 6
    const need = measure.scrollWidth + primaryEl.scrollWidth + gap
    const next = need > root.clientWidth
    setCollapsed(next)
    setActionCount(countToolbarActions(measure))
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
  }, [menuOpen])

  return (
    <div ref={rootRef} className={className ?? 'editor-toolbar'}>
      <div className="toolbar-overflow-measure" ref={measureRef} aria-hidden="true">
        {secondary}
      </div>
      {!collapsed ? <div className="toolbar-overflow-secondary">{secondary}</div> : null}
      {collapsed ? (
        <div className="toolbar-overflow-more">
          <button
            type="button"
            className={
              menuOpen
                ? 'btn btn-ghost run-btn toolbar-more-btn is-active'
                : 'btn btn-ghost run-btn toolbar-more-btn'
            }
            aria-expanded={menuOpen}
            aria-haspopup="menu"
            aria-label={toolbarMoreAria(actionCount, menuOpen)}
            title={toolbarMoreTitle(actionCount)}
            onMouseDown={(event) => event.stopPropagation()}
            onClick={() => setMenuOpen((open) => !open)}
          >
            {toolbarMoreLabel(actionCount)}
          </button>
          {menuOpen ? (
            <div
              className="toolbar-overflow-menu"
              role="menu"
              aria-label={toolbarOverflowMenuTitle()}
              onMouseDown={(event) => event.stopPropagation()}
              onClick={(event) => {
                const target = event.target as HTMLElement | null
                if (target?.closest('button, [role="menuitem"], a[href]')) {
                  setMenuOpen(false)
                }
              }}
            >
              <div className="toolbar-overflow-menu-head">
                <EmptyState
                  compact
                  kicker={toolbarOverflowMenuKicker()}
                  title={
                    actionCount > 0 ? toolbarOverflowMenuTitle() : toolbarOverflowEmptyTitle()
                  }
                  body={
                    actionCount > 0
                      ? toolbarOverflowMenuBody(actionCount)
                      : toolbarOverflowEmptyBody()
                  }
                />
              </div>
              {actionCount > 0 ? <div className="toolbar-overflow-menu-actions">{secondary}</div> : null}
            </div>
          ) : null}
        </div>
      ) : null}
      <div className="toolbar-overflow-primary" ref={primaryRef}>
        {primary}
      </div>
    </div>
  )
}
