import {
  Children,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import { createPortal } from 'react-dom'
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

function flattenSecondary(secondary: ReactNode): ReactNode[] {
  return Children.toArray(secondary)
}

function measureChildWidths(measure: HTMLElement): number[] {
  return Array.from(measure.children).map((child) => {
    if (!(child instanceof HTMLElement)) return 0
    const rect = child.getBoundingClientRect().width
    const scroll = child.scrollWidth
    const offset = child.offsetWidth
    return Math.ceil(Math.max(rect, scroll, offset, 0))
  })
}

type Props = {
  /** Always visible at the end (e.g. Run). Omit / null when unused. */
  primary?: ReactNode
  /** Secondary actions; as many as fit stay on the row, rest go in 「更多」. */
  secondary: ReactNode
  className?: string
}

/**
 * Packs as many secondary actions as fit beside `primary`, and portals the
 * remainder into a 「更多」 menu (avoids overflow:hidden clipping).
 */
export function ToolbarOverflow({ primary, secondary, className }: Props) {
  const rootRef = useRef<HTMLDivElement>(null)
  const measureRef = useRef<HTMLDivElement>(null)
  const primaryRef = useRef<HTMLDivElement>(null)
  const moreBtnRef = useRef<HTMLButtonElement>(null)
  const [visibleCount, setVisibleCount] = useState<number | null>(null)
  const [menuOpen, setMenuOpen] = useState(false)
  const [overflowActionCount, setOverflowActionCount] = useState(0)
  const [menuPos, setMenuPos] = useState<{ top: number; left: number } | null>(null)

  const items = flattenSecondary(secondary)

  const recompute = () => {
    const root = rootRef.current
    const measure = measureRef.current
    if (!root || !measure) return

    const gap = 6
    const safety = 8
    const primaryW = primaryRef.current
      ? Math.max(
          Math.ceil(primaryRef.current.getBoundingClientRect().width),
          primaryRef.current.scrollWidth,
        )
      : 0
    // Use the toolbar root's content box; never trust a zero/stale width.
    const rootW = Math.max(Math.floor(root.getBoundingClientRect().width), root.clientWidth)
    const available = Math.max(0, rootW - primaryW - (primaryW > 0 ? gap : 0) - safety)
    const widths = measureChildWidths(measure).map((w) => Math.max(Math.ceil(w), 1) + 2)
    const total = widths.length
    const kids = Array.from(measure.children)

    const actionsFrom = (start: number) => {
      let n = 0
      for (let i = start; i < kids.length; i += 1) n += countToolbarActions(kids[i]!)
      return n
    }

    const moreWidthFor = (hiddenActions: number) => {
      if (hiddenActions <= 0) return 0
      const label = `更多 · ${Math.max(hiddenActions, 1)}`
      return Math.ceil(36 + label.length * 10)
    }

    if (total === 0) {
      setVisibleCount(0)
      setOverflowActionCount(0)
      setMenuOpen(false)
      return
    }

    const sumWidths = (count: number) => {
      let used = 0
      for (let i = 0; i < count; i += 1) {
        used += widths[i]! + (i > 0 ? gap : 0)
      }
      return used
    }

    // Prefer showing all only when they truly fit with slack.
    if (sumWidths(total) <= available) {
      setVisibleCount(total)
      setOverflowActionCount(0)
      setMenuOpen(false)
      return
    }

    // Binary-search largest fit where items + 「更多」 fit in available.
    let lo = 0
    let hi = total - 1
    let best = 0
    while (lo <= hi) {
      const mid = (lo + hi) >> 1
      const hidden = actionsFrom(mid)
      const need = sumWidths(mid) + gap + moreWidthFor(hidden)
      if (need <= available) {
        best = mid
        lo = mid + 1
      } else {
        hi = mid - 1
      }
    }

    const hiddenActions = actionsFrom(best)
    setVisibleCount(best)
    setOverflowActionCount(hiddenActions)
  }

  useLayoutEffect(() => {
    recompute()
  })

  useEffect(() => {
    const root = rootRef.current
    if (!root) return
    let raf = 0
    const schedule = () => {
      if (raf) cancelAnimationFrame(raf)
      raf = requestAnimationFrame(() => {
        raf = 0
        recompute()
      })
    }
    const ro = new ResizeObserver(schedule)
    ro.observe(root)
    if (primaryRef.current) ro.observe(primaryRef.current)
    // Pane/window chrome often resizes ancestors first — watch parent too.
    if (root.parentElement) ro.observe(root.parentElement)
    window.addEventListener('resize', schedule)
    return () => {
      if (raf) cancelAnimationFrame(raf)
      ro.disconnect()
      window.removeEventListener('resize', schedule)
    }
  }, [])

  useEffect(() => {
    if (!menuOpen) {
      setMenuPos(null)
      return
    }
    const place = () => {
      const btn = moreBtnRef.current
      if (!btn) return
      const rect = btn.getBoundingClientRect()
      const left = Math.min(Math.max(8, rect.left), window.innerWidth - 240)
      setMenuPos({ top: rect.bottom + 4, left })
    }
    place()
    const close = (event: MouseEvent) => {
      const target = event.target as Node | null
      if (moreBtnRef.current?.contains(target)) return
      const menu = document.querySelector('.toolbar-overflow-menu.is-portal')
      if (menu?.contains(target)) return
      setMenuOpen(false)
    }
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault()
        setMenuOpen(false)
      }
    }
    window.addEventListener('mousedown', close, true)
    window.addEventListener('keydown', onKey, true)
    window.addEventListener('resize', place)
    window.addEventListener('scroll', place, true)
    return () => {
      window.removeEventListener('mousedown', close, true)
      window.removeEventListener('keydown', onKey, true)
      window.removeEventListener('resize', place)
      window.removeEventListener('scroll', place, true)
    }
  }, [menuOpen])

  const shown = visibleCount == null ? items.length : visibleCount
  const overflowed = visibleCount != null && items.length > visibleCount
  const visibleItems = items.slice(0, shown)
  const overflowItems = overflowed ? items.slice(shown) : []
  const moreCount = overflowActionCount

  return (
    <div
      ref={rootRef}
      className={`${className ?? 'editor-toolbar'}${menuOpen ? ' is-menu-open' : ''}`}
    >
      <div className="toolbar-overflow-measure" ref={measureRef} aria-hidden="true">
        {items}
      </div>
      <div className="toolbar-overflow-secondary">{visibleItems}</div>
      {overflowed ? (
        <div className="toolbar-overflow-more">
          <button
            ref={moreBtnRef}
            type="button"
            className={
              menuOpen
                ? 'btn btn-ghost run-btn toolbar-more-btn is-active'
                : 'btn btn-ghost run-btn toolbar-more-btn'
            }
            aria-expanded={menuOpen}
            aria-haspopup="menu"
            aria-label={toolbarMoreAria(moreCount, menuOpen)}
            title={toolbarMoreTitle(moreCount)}
            onMouseDown={(event) => event.stopPropagation()}
            onClick={(event) => {
              event.stopPropagation()
              setMenuOpen((open) => !open)
            }}
          >
            {toolbarMoreLabel(moreCount)}
          </button>
          {menuOpen && menuPos
            ? createPortal(
                <div
                  className="toolbar-overflow-menu is-portal"
                  role="menu"
                  aria-label={toolbarOverflowMenuTitle()}
                  style={{ top: menuPos.top, left: menuPos.left }}
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
                        moreCount > 0 ? toolbarOverflowMenuTitle() : toolbarOverflowEmptyTitle()
                      }
                      body={
                        moreCount > 0
                          ? toolbarOverflowMenuBody(moreCount)
                          : toolbarOverflowEmptyBody()
                      }
                    />
                  </div>
                  {overflowItems.length > 0 ? (
                    <div className="toolbar-overflow-menu-actions">{overflowItems}</div>
                  ) : null}
                </div>,
                document.body,
              )
            : null}
        </div>
      ) : null}
      <div
        className={primary != null && primary !== false ? 'toolbar-overflow-primary' : 'toolbar-overflow-primary is-empty'}
        ref={primaryRef}
        aria-hidden={primary == null || primary === false ? true : undefined}
      >
        {primary != null && primary !== false ? primary : null}
      </div>
    </div>
  )
}
