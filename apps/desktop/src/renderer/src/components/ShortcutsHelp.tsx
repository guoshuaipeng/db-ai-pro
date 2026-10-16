import { useEffect, useMemo, useRef, useState } from 'react'
import { SHORTCUT_HELP } from '@shared/commands'
import {
  filterShortcutHelp,
  formatShortcutHelpClipboard,
  shortcutHelpEmptyBody,
  shortcutKeysCopiedToast,
  shortcutListCopiedToast,
} from '@shared/shortcutHelp'
import { EmptyState } from './EmptyState'
import { useWorkspace } from '../state/workspace'

export function ShortcutsHelp({ open, onClose }: { open: boolean; onClose: () => void }) {
  const ws = useWorkspace()
  const [query, setQuery] = useState('')
  const searchRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (!open) {
      setQuery('')
      return
    }
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault()
        onClose()
      }
    }
    window.addEventListener('keydown', onKey, true)
    queueMicrotask(() => {
      searchRef.current?.focus()
      searchRef.current?.select()
    })
    return () => window.removeEventListener('keydown', onKey, true)
  }, [open, onClose])

  const filtered = useMemo(() => filterShortcutHelp(SHORTCUT_HELP, query), [query])

  const copyKeys = async (action: string, keys: string) => {
    try {
      await navigator.clipboard.writeText(keys)
      ws.pushToast('success', shortcutKeysCopiedToast(action))
    } catch {
      ws.pushToast('error', '复制失败')
    }
  }

  const copyList = async () => {
    if (filtered.length === 0) {
      ws.pushToast('info', shortcutListCopiedToast(0))
      return
    }
    try {
      await navigator.clipboard.writeText(formatShortcutHelpClipboard(filtered))
      ws.pushToast('success', shortcutListCopiedToast(filtered.length))
    } catch {
      ws.pushToast('error', '复制失败')
    }
  }

  if (!open) return null

  return (
    <div className="overlay" role="presentation" onMouseDown={onClose}>
      <div
        className="dialog dialog-wide shortcuts-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="shortcuts-title"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <h2 id="shortcuts-title">键盘快捷键</h2>
        <p className="dialog-copy">
          与 Monaco 常用编辑键尽量错开；冲突时以编辑器内快捷键为准。多光标（Alt+单击 / Ctrl+Alt+↑↓）为 Monaco
          内置。也可用命令面板（Ctrl+K）搜索能力。点击一行可复制按键。
        </p>
        <label className="shortcut-search">
          <span className="sr-only">筛选快捷键</span>
          <input
            ref={searchRef}
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="筛选动作或按键，例如 运行、Ctrl+K、刷新…"
            aria-label="筛选快捷键"
          />
          {query.trim() && (
            <button type="button" className="shortcut-search-clear" aria-label="清除筛选" onClick={() => setQuery('')}>
              ×
            </button>
          )}
        </label>
        <p className="shortcut-stats" aria-live="polite">
          {query.trim()
            ? `显示 ${filtered.length} / ${SHORTCUT_HELP.length}`
            : `共 ${SHORTCUT_HELP.length} 条`}
        </p>
        {filtered.length === 0 ? (
          <EmptyState
            compact
            title="没有匹配的快捷键"
            body={shortcutHelpEmptyBody()}
            actions={
              <button type="button" className="btn btn-ghost" onClick={() => setQuery('')}>
                清除筛选
              </button>
            }
          />
        ) : (
          <ul className="shortcut-list">
            {filtered.map((row) => (
              <li key={`${row.action}:${row.keys}`} className="shortcut-row">
                <button
                  type="button"
                  className="shortcut-row-btn"
                  title={`复制按键：${row.keys}`}
                  onClick={() => void copyKeys(row.action, row.keys)}
                >
                  <span className="shortcut-action">{row.action}</span>
                  <kbd>{row.keys}</kbd>
                </button>
              </li>
            ))}
          </ul>
        )}
        <div className="dialog-actions">
          <button
            type="button"
            className="btn btn-ghost"
            disabled={filtered.length === 0}
            title="复制当前列表（动作与按键，制表符分隔）"
            onClick={() => void copyList()}
          >
            复制列表
          </button>
          <button type="button" className="btn btn-primary" onClick={onClose}>
            知道了
          </button>
        </div>
      </div>
    </div>
  )
}
