import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { filterTabsForPicker } from '@shared/tabPicker'
import {
  tabPickerButtonAria,
  tabPickerButtonTitle,
  tabPickerClearFilterLabel,
  tabPickerCloseTitle,
  tabPickerEmptyBody,
  tabPickerEmptyTitle,
  tabPickerFilterStatus,
  tabPickerFoot,
  tabPickerMenuAria,
  tabPickerSearchAria,
  tabPickerSearchPlaceholder,
} from '@shared/tabPickerUi'
import { isTabstripBackgroundDoubleClick } from '@shared/tabstripNewTab'
import { EmptyState } from './EmptyState'

type TabItem = {
  id: string
  /** Display label (may include dirty • prefix). */
  label: string
  /** Raw title used for inline rename (no dirty prefix). */
  editTitle?: string
  /** Optional muted badge, e.g. disconnected connection */
  badge?: string
  tone?: 'warn' | 'muted'
  pinned?: boolean
  /** Unsaved SQL relative to clean baseline. */
  dirty?: boolean
  /** Connection colorTag hex (left stripe); omit/null = neutral. */
  color?: string | null
}

export type TabContextAction = 'pin' | 'unpin' | 'rename' | 'duplicate' | 'close' | 'close-others' | 'close-right'

type ScrollTabsProps = {
  label: string
  tabs: TabItem[]
  activeId: string
  onSelect: (id: string) => void
  onClose?: (id: string) => void
  onContextAction?: (id: string, action: TabContextAction) => void
  /** When set, only these context actions appear (close still needs onClose). */
  contextActions?: TabContextAction[]
  onRename?: (id: string, title: string) => void
  /** Move tab to insert-before index (clamped by pin group in workspace). */
  onReorder?: (fromId: string, insertBeforeIndex: number) => void
  /** Double-click empty strip area (Chrome / VS Code style). */
  onEmptyDoubleClick?: () => void
  emptyDoubleClickTitle?: string
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
  contextActions,
  onRename,
  onReorder,
  onEmptyDoubleClick,
  emptyDoubleClickTitle = '双击空白处新建查询',
  trailing,
}: ScrollTabsProps) {
  const allowContext = (action: TabContextAction) =>
    !contextActions || contextActions.includes(action)
  const scroller = useRef<HTMLDivElement>(null)
  const renameInputRef = useRef<HTMLInputElement>(null)
  const pickerRef = useRef<HTMLDivElement>(null)
  const pickerSearchRef = useRef<HTMLInputElement>(null)
  const [overflow, setOverflow] = useState({ left: false, right: false })
  const [menu, setMenu] = useState<MenuState>(null)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [draft, setDraft] = useState('')
  const skipBlurCommit = useRef(false)
  const [draggingId, setDraggingId] = useState<string | null>(null)
  const [dropBeforeIndex, setDropBeforeIndex] = useState<number | null>(null)
  const [pickerOpen, setPickerOpen] = useState(false)
  const [pickerQuery, setPickerQuery] = useState('')

  const filteredPickerTabs = useMemo(
    () => filterTabsForPicker(tabs, pickerQuery),
    [tabs, pickerQuery],
  )

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

  useEffect(() => {
    if (!pickerOpen) return
    const close = (event: MouseEvent) => {
      if (pickerRef.current?.contains(event.target as Node)) return
      setPickerOpen(false)
      setPickerQuery('')
    }
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault()
        setPickerOpen(false)
        setPickerQuery('')
      }
    }
    window.addEventListener('mousedown', close)
    window.addEventListener('keydown', onKey, true)
    queueMicrotask(() => {
      pickerSearchRef.current?.focus()
      pickerSearchRef.current?.select()
    })
    return () => {
      window.removeEventListener('mousedown', close)
      window.removeEventListener('keydown', onKey, true)
    }
  }, [pickerOpen])

  useEffect(() => {
    if (!editingId) return
    const input = renameInputRef.current
    if (!input) return
    input.focus()
    input.select()
  }, [editingId])

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

  const beginRename = (tab: TabItem) => {
    if (!onRename) return
    setMenu(null)
    setPickerOpen(false)
    setDraggingId(null)
    setDropBeforeIndex(null)
    onSelect(tab.id)
    setDraft(tab.editTitle ?? tab.label)
    setEditingId(tab.id)
  }

  const cancelRename = () => {
    skipBlurCommit.current = true
    setEditingId(null)
    setDraft('')
  }

  const commitRename = () => {
    if (!editingId || !onRename) {
      setEditingId(null)
      return
    }
    const id = editingId
    const value = draft
    setEditingId(null)
    setDraft('')
    onRename(id, value)
  }

  const runAction = (id: string, action: TabContextAction) => {
    setMenu(null)
    if (action === 'rename') {
      const tab = tabs.find((row) => row.id === id)
      if (tab) beginRename(tab)
      return
    }
    onContextAction?.(id, action)
  }

  const pickTab = (id: string) => {
    onSelect(id)
    setPickerOpen(false)
    setPickerQuery('')
  }

  const menuTab = menu ? tabs.find((tab) => tab.id === menu.id) : null
  const hasOverflow = overflow.left || overflow.right
  const showPicker = tabs.length > 1

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
        title={onEmptyDoubleClick ? emptyDoubleClickTitle : undefined}
        onDoubleClick={(event) => {
          if (!onEmptyDoubleClick) return
          if (!isTabstripBackgroundDoubleClick(event.target as Element)) return
          event.preventDefault()
          onEmptyDoubleClick()
        }}
      >
        {tabs.map((tab, index) => {
          const selected = tab.id === activeId
          const renaming = editingId === tab.id
          const tabClass = [
            'tab',
            selected ? 'is-active' : '',
            tab.pinned ? 'is-pinned' : '',
            tab.dirty ? 'is-dirty' : '',
            renaming ? 'is-renaming' : '',
            draggingId === tab.id ? 'is-dragging' : '',
            dropBeforeIndex === index ? 'is-drop-before' : '',
            dropBeforeIndex === index + 1 && index === tabs.length - 1 ? 'is-drop-after' : '',
            tab.color ? 'has-conn-color' : '',
          ]
            .filter(Boolean)
            .join(' ')
          return (
            <div
              key={tab.id}
              className={tabClass}
              role="presentation"
              draggable={Boolean(onReorder) && !renaming}
              onDragStart={(event) => {
                if (!onReorder || renaming) {
                  event.preventDefault()
                  return
                }
                const target = event.target as HTMLElement
                if (target.closest('.tab-close, .tab-rename-input, .tab-context-menu')) {
                  event.preventDefault()
                  return
                }
                event.dataTransfer.setData('text/plain', tab.id)
                event.dataTransfer.effectAllowed = 'move'
                setDraggingId(tab.id)
                setMenu(null)
                setPickerOpen(false)
              }}
              onDragEnd={() => {
                setDraggingId(null)
                setDropBeforeIndex(null)
              }}
              onDragOver={(event) => {
                if (!onReorder || !draggingId) return
                event.preventDefault()
                event.dataTransfer.dropEffect = 'move'
                const rect = (event.currentTarget as HTMLElement).getBoundingClientRect()
                const before = event.clientX < rect.left + rect.width / 2
                setDropBeforeIndex(before ? index : index + 1)
              }}
              onDrop={(event) => {
                if (!onReorder) return
                event.preventDefault()
                const fromId = event.dataTransfer.getData('text/plain') || draggingId
                const insertAt = dropBeforeIndex ?? index
                if (fromId) onReorder(fromId, insertAt)
                setDraggingId(null)
                setDropBeforeIndex(null)
              }}
              onAuxClick={(event) => {
                if (event.button !== 1 || !onClose || renaming) return
                event.preventDefault()
                onClose(tab.id)
              }}
              onContextMenu={(event) => {
                if (!onContextAction && !onRename) return
                event.preventDefault()
                if (renaming) return
                onSelect(tab.id)
                setPickerOpen(false)
                setMenu({ id: tab.id, x: event.clientX, y: event.clientY })
              }}
            >
              {tab.color ? (
                <span
                  className="tab-conn-stripe"
                  style={{ background: tab.color }}
                  title="连接颜色"
                  aria-hidden="true"
                />
              ) : null}
              {renaming ? (
                <div className="tab-main is-editing" role="tab" aria-selected={selected} data-tab={tab.id}>
                  {tab.pinned && (
                    <span className="tab-pin" aria-hidden="true">
                      <PinIcon />
                    </span>
                  )}
                  <input
                    ref={renameInputRef}
                    className="tab-rename-input"
                    value={draft}
                    aria-label="重命名标签"
                    maxLength={64}
                    onChange={(event) => setDraft(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter') {
                        event.preventDefault()
                        commitRename()
                      } else if (event.key === 'Escape') {
                        event.preventDefault()
                        cancelRename()
                      }
                      event.stopPropagation()
                    }}
                    onBlur={() => {
                      if (skipBlurCommit.current) {
                        skipBlurCommit.current = false
                        return
                      }
                      commitRename()
                    }}
                    onClick={(event) => event.stopPropagation()}
                  />
                </div>
              ) : (
                <button
                  type="button"
                  role="tab"
                  data-tab={tab.id}
                  className="tab-main"
                  aria-selected={selected}
                  title={tab.pinned ? `${tab.label}（已固定）· 双击重命名 · 中键关闭` : `${tab.label} · 双击重命名 · 中键关闭`}
                  onClick={() => onSelect(tab.id)}
                  onDoubleClick={(event) => {
                    event.preventDefault()
                    beginRename(tab)
                  }}
                  onKeyDown={(event) => {
                    if (event.key === 'ArrowRight') {
                      event.preventDefault()
                      focusSibling(tab.id, 1)
                    }
                    if (event.key === 'ArrowLeft') {
                      event.preventDefault()
                      focusSibling(tab.id, -1)
                    }
                    if (event.key === 'F2' && onRename) {
                      event.preventDefault()
                      beginRename(tab)
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
              )}
              {onClose && !renaming && (
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
        {onEmptyDoubleClick ? (
          <div
            className="tabstrip-empty"
            title={emptyDoubleClickTitle}
            aria-hidden="true"
            onDoubleClick={(event) => {
              event.preventDefault()
              event.stopPropagation()
              onEmptyDoubleClick()
            }}
          />
        ) : null}
      </div>
      {hasOverflow && (
        <button type="button" className="tab-nav" aria-label="向右滚动标签" disabled={!overflow.right} onClick={() => move(1)}>
          <Chevron direction="right" />
        </button>
      )}
      {showPicker && (
        <div className="tab-picker" ref={pickerRef}>
          <button
            type="button"
            className={pickerOpen ? 'tab-nav tab-picker-btn is-open' : 'tab-nav tab-picker-btn'}
            aria-label={tabPickerButtonAria()}
            aria-expanded={pickerOpen}
            aria-haspopup="listbox"
            title={tabPickerButtonTitle()}
            onClick={() => {
              setMenu(null)
              setPickerOpen((open) => {
                if (open) setPickerQuery('')
                return !open
              })
            }}
          >
            <ListChevron />
          </button>
          {pickerOpen && (
            <div className="tab-picker-menu" role="listbox" aria-label={tabPickerMenuAria()}>
              <div className="tab-picker-search">
                <input
                  ref={pickerSearchRef}
                  value={pickerQuery}
                  onChange={(event) => setPickerQuery(event.target.value)}
                  placeholder={tabPickerSearchPlaceholder()}
                  aria-label={tabPickerSearchAria()}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter' && filteredPickerTabs[0]) {
                      event.preventDefault()
                      pickTab(filteredPickerTabs[0].id)
                    }
                  }}
                />
              </div>
              <p className="sr-only" role="status" aria-live="polite">
                {tabPickerFilterStatus(
                  filteredPickerTabs.length,
                  tabs.length,
                  Boolean(pickerQuery.trim()),
                )}
              </p>
              <div className="tab-picker-list">
                {filteredPickerTabs.length === 0 ? (
                  <div className="tab-picker-empty-wrap">
                    <EmptyState
                      compact
                      title={tabPickerEmptyTitle()}
                      body={tabPickerEmptyBody()}
                      actions={
                        pickerQuery.trim() ? (
                          <button
                            type="button"
                            className="btn btn-ghost"
                            onClick={() => setPickerQuery('')}
                          >
                            {tabPickerClearFilterLabel()}
                          </button>
                        ) : null
                      }
                    />
                  </div>
                ) : (
                  filteredPickerTabs.map((tab) => {
                    const full = tabs.find((row) => row.id === tab.id)
                    const selected = tab.id === activeId
                    return (
                      <button
                        key={tab.id}
                        type="button"
                        role="option"
                        aria-selected={selected}
                        className={selected ? 'tab-picker-item is-active' : 'tab-picker-item'}
                        onClick={() => pickTab(tab.id)}
                      >
                        {full?.color ? (
                          <span className="tab-picker-stripe" style={{ background: full.color }} aria-hidden="true" />
                        ) : (
                          <span className="tab-picker-stripe is-neutral" aria-hidden="true" />
                        )}
                        {tab.pinned && (
                          <span className="tab-pin" aria-hidden="true">
                            <PinIcon />
                          </span>
                        )}
                        <span className="tab-picker-label">{tab.label}</span>
                        {tab.badge && <span className="tab-badge">{tab.badge}</span>}
                        {onClose && (
                          <span
                            className="tab-picker-close"
                            role="presentation"
                            title={tabPickerCloseTitle()}
                            onClick={(event) => {
                              event.stopPropagation()
                              onClose(tab.id)
                            }}
                          >
                            <CloseIcon />
                          </span>
                        )}
                      </button>
                    )
                  })
                )}
              </div>
              <p className="tab-picker-foot">
                {tabPickerFoot(tabs.length, filteredPickerTabs.length, Boolean(pickerQuery.trim()))}
              </p>
            </div>
          )}
        </div>
      )}
      {trailing}
      {menu && menuTab && (onContextAction || onRename) && (
        <div
          className="tab-context-menu"
          role="menu"
          style={{ left: menu.x, top: menu.y }}
          onMouseDown={(event) => event.stopPropagation()}
        >
          {onRename && (
            <button type="button" role="menuitem" onClick={() => runAction(menuTab.id, 'rename')}>
              重命名
            </button>
          )}
          {onContextAction && allowContext('duplicate') && (
            <button type="button" role="menuitem" onClick={() => runAction(menuTab.id, 'duplicate')}>
              复制标签
            </button>
          )}
          {onContextAction && (allowContext('pin') || allowContext('unpin')) && (
            <button
              type="button"
              role="menuitem"
              onClick={() => runAction(menuTab.id, menuTab.pinned ? 'unpin' : 'pin')}
            >
              {menuTab.pinned ? '取消固定' : '固定'}
            </button>
          )}
          {onClose && (
            <button type="button" role="menuitem" onClick={() => runAction(menuTab.id, 'close')}>
              关闭
            </button>
          )}
          {onContextAction && allowContext('close-others') && (
            <button type="button" role="menuitem" onClick={() => runAction(menuTab.id, 'close-others')}>
              关闭其他
            </button>
          )}
          {onContextAction && allowContext('close-right') && (
            <button type="button" role="menuitem" onClick={() => runAction(menuTab.id, 'close-right')}>
              关闭右侧
            </button>
          )}
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

function ListChevron() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">
      <path d="M4 6.5 8 10.5 12 6.5" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
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
