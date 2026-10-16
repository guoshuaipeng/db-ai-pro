import { useEffect } from 'react'
import { SHORTCUT_HELP } from '@shared/commands'

export function ShortcutsHelp({ open, onClose }: { open: boolean; onClose: () => void }) {
  useEffect(() => {
    if (!open) return
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault()
        onClose()
      }
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [open, onClose])

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
        <p className="dialog-copy">与 Monaco 常用编辑键尽量错开；冲突时以编辑器内快捷键为准，可用命令面板（Ctrl+K / Ctrl+P）搜索表、列与收藏。收藏片段支持 {'{{table}}'} / {'{{limit}}'} 等占位符，插入时弹出填写框。</p>
        <ul className="shortcut-list">
          {SHORTCUT_HELP.map((row) => (
            <li key={row.action} className="shortcut-row">
              <span>{row.action}</span>
              <kbd>{row.keys}</kbd>
            </li>
          ))}
        </ul>
        <div className="dialog-actions">
          <button type="button" className="btn btn-primary" onClick={onClose}>
            知道了
          </button>
        </div>
      </div>
    </div>
  )
}
