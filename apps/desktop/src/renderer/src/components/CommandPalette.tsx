import { useEffect, useMemo, useRef, useState } from 'react'
import { filterCommands, type CommandDef } from '@shared/commands'

type CommandPaletteProps = {
  open: boolean
  onClose: () => void
  onRun: (command: CommandDef) => void
}

export function CommandPalette({ open, onClose, onRun }: CommandPaletteProps) {
  const [query, setQuery] = useState('')
  const [active, setActive] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)
  const listRef = useRef<HTMLDivElement>(null)

  const items = useMemo(() => filterCommands(query), [query])

  useEffect(() => {
    if (!open) return
    setQuery('')
    setActive(0)
    const handle = window.setTimeout(() => inputRef.current?.focus(), 0)
    return () => window.clearTimeout(handle)
  }, [open])

  useEffect(() => {
    setActive(0)
  }, [query])

  useEffect(() => {
    if (!open) return
    const node = listRef.current?.querySelector<HTMLElement>(`[data-cmd-index="${active}"]`)
    node?.scrollIntoView({ block: 'nearest' })
  }, [active, open, items.length])

  if (!open) return null

  const runAt = (index: number) => {
    const command = items[index]
    if (!command) return
    onClose()
    // Defer so the modal unmounts before side effects (dialogs / focus).
    window.setTimeout(() => onRun(command), 0)
  }

  return (
    <div
      className="palette-overlay"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose()
      }}
    >
      <div
        className="palette"
        role="dialog"
        aria-modal="true"
        aria-label="命令面板"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="palette-search">
          <input
            ref={inputRef}
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="搜索命令…（运行、计划、收藏、导入…）"
            aria-label="搜索命令"
            onKeyDown={(event) => {
              if (event.key === 'Escape') {
                event.preventDefault()
                onClose()
              } else if (event.key === 'ArrowDown') {
                event.preventDefault()
                setActive((index) => Math.min(items.length - 1, index + 1))
              } else if (event.key === 'ArrowUp') {
                event.preventDefault()
                setActive((index) => Math.max(0, index - 1))
              } else if (event.key === 'Enter') {
                event.preventDefault()
                runAt(active)
              }
            }}
          />
          <kbd className="palette-kbd">Esc</kbd>
        </div>
        <div className="palette-list" role="listbox" aria-label="命令列表" ref={listRef}>
          {items.length === 0 && <p className="palette-empty">没有匹配的命令</p>}
          {items.map((command, index) => (
            <button
              key={command.id}
              type="button"
              role="option"
              data-cmd-index={index}
              aria-selected={index === active}
              className={index === active ? 'palette-item is-active' : 'palette-item'}
              onMouseEnter={() => setActive(index)}
              onClick={() => runAt(index)}
            >
              <span className="palette-item-main">
                <span className="palette-title">{command.title}</span>
                {command.subtitle && <span className="palette-sub">{command.subtitle}</span>}
              </span>
              {command.shortcut && <kbd className="palette-shortcut">{command.shortcut}</kbd>}
            </button>
          ))}
        </div>
        <footer className="palette-foot">
          <span>↑↓ 选择</span>
          <span>Enter 执行</span>
          <span>Ctrl+K 打开</span>
        </footer>
      </div>
    </div>
  )
}
