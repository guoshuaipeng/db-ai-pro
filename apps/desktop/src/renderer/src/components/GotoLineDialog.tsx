import { useEffect, useRef, useState } from 'react'
import { formatGotoLineSeed, parseGotoLineInput } from '@shared/gotoLine'

type Props = {
  open: boolean
  seedLine: number
  seedColumn: number
  onClose: () => void
  onGoto: (target: { line: number; column: number }) => void
}

/** Jump cursor to line[:column] in the active SQL editor (M80). */
export function GotoLineDialog({ open, seedLine, seedColumn, onClose, onGoto }: Props) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [raw, setRaw] = useState('')
  const [touched, setTouched] = useState(false)

  useEffect(() => {
    if (!open) return
    setRaw(formatGotoLineSeed(seedLine, seedColumn))
    setTouched(false)
    const t = window.setTimeout(() => {
      inputRef.current?.focus()
      inputRef.current?.select()
    }, 0)
    return () => window.clearTimeout(t)
  }, [open, seedLine, seedColumn])

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

  const parsed = parseGotoLineInput(raw)
  const showError = touched && !parsed

  const submit = () => {
    setTouched(true)
    if (!parsed) return
    onGoto(parsed)
    onClose()
  }

  return (
    <div className="overlay" role="presentation" onMouseDown={onClose}>
      <div
        className="dialog goto-line-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="goto-line-title"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <h2 id="goto-line-title">转到行</h2>
        <p className="dialog-copy">输入行号，或「行:列」（如 42 或 42:8）。</p>
        <label className="field">
          <span>位置</span>
          <input
            ref={inputRef}
            value={raw}
            onChange={(event) => {
              setRaw(event.target.value)
              setTouched(true)
            }}
            spellCheck={false}
            inputMode="numeric"
            placeholder="行 或 行:列"
            aria-invalid={showError}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                event.preventDefault()
                submit()
              }
            }}
          />
        </label>
        {showError ? <p className="field-error">请输入有效的行号（可选列）。</p> : null}
        <div className="dialog-actions">
          <button type="button" className="btn btn-ghost" onClick={onClose}>
            取消
          </button>
          <button type="button" className="btn btn-primary" disabled={!parsed} onClick={submit}>
            转到
          </button>
        </div>
      </div>
    </div>
  )
}
