import { useEffect, useMemo, useRef, useState } from 'react'
import { clampGotoLineTarget, parseGotoLineInput } from '@shared/gotoLine'
import {
  gotoLineChipCurrent,
  gotoLineChipEnd,
  gotoLineChipStart,
  gotoLineDocMeta,
  gotoLineEmptyBody,
  gotoLineEmptyTitle,
  gotoLineFieldLabel,
  gotoLineInvalidError,
  gotoLineKicker,
  gotoLineLead,
  gotoLinePlaceholder,
  gotoLinePreview,
  gotoLineSubmitLabel,
  gotoLineTitle,
  gotoLineToast,
  seedGotoLineInput,
} from '@shared/gotoLineUi'
import { useWorkspace } from '../state/workspace'
import { EmptyState } from './EmptyState'

type Props = {
  open: boolean
  seedLine: number
  seedColumn: number
  /** Approximate total lines in the active editor document. */
  lineCount: number
  /** When false, show empty state (no editor tab). */
  hasDocument?: boolean
  onClose: () => void
  onGoto: (target: { line: number; column: number }) => void
}

/** Jump cursor to line[:column] in the active SQL editor. */
export function GotoLineDialog({
  open,
  seedLine,
  seedColumn,
  lineCount,
  hasDocument = true,
  onClose,
  onGoto,
}: Props) {
  const ws = useWorkspace()
  const inputRef = useRef<HTMLInputElement>(null)
  const [raw, setRaw] = useState('')
  const [touched, setTouched] = useState(false)

  useEffect(() => {
    if (!open) return
    setRaw(seedGotoLineInput(seedLine, seedColumn))
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

  const parsed = useMemo(() => parseGotoLineInput(raw), [raw])
  const preview = useMemo(() => gotoLinePreview(parsed, lineCount), [parsed, lineCount])
  const showError = touched && !parsed

  if (!open) return null

  const applySeed = (line: number, column = 1) => {
    setRaw(seedGotoLineInput(line, column))
    setTouched(true)
    queueMicrotask(() => inputRef.current?.select())
  }

  const submit = () => {
    setTouched(true)
    if (!parsed) return
    const safeCount = Math.max(1, Math.floor(lineCount) || 1)
    const target = clampGotoLineTarget(parsed, safeCount, () => 1_000_000)
    onGoto(target)
    ws.pushToast('success', gotoLineToast(target))
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
        <h2 id="goto-line-title">{gotoLineTitle()}</h2>
        {!hasDocument ? (
          <EmptyState
            compact
            kicker={gotoLineKicker()}
            title={gotoLineEmptyTitle()}
            body={gotoLineEmptyBody()}
          />
        ) : (
          <>
            <p className="dialog-copy">{gotoLineLead()}</p>
            <p className="goto-line-meta">{gotoLineDocMeta(lineCount)}</p>
            <div className="goto-line-chips" role="group" aria-label="快捷位置">
              <button type="button" className="btn btn-ghost tiny-btn" onClick={() => applySeed(1, 1)}>
                {gotoLineChipStart()}
              </button>
              <button
                type="button"
                className="btn btn-ghost tiny-btn"
                onClick={() => applySeed(seedLine, seedColumn)}
              >
                {gotoLineChipCurrent()}
              </button>
              <button
                type="button"
                className="btn btn-ghost tiny-btn"
                onClick={() => applySeed(Math.max(1, lineCount), 1)}
              >
                {gotoLineChipEnd()}
              </button>
            </div>
            <label className="field">
              <span>{gotoLineFieldLabel()}</span>
              <input
                ref={inputRef}
                value={raw}
                onChange={(event) => {
                  setRaw(event.target.value)
                  setTouched(true)
                }}
                spellCheck={false}
                inputMode="numeric"
                placeholder={gotoLinePlaceholder()}
                aria-invalid={showError}
                aria-describedby="goto-line-preview"
                onKeyDown={(event) => {
                  if (event.key === 'Enter') {
                    event.preventDefault()
                    submit()
                  }
                }}
              />
            </label>
            {showError ? <p className="field-error">{gotoLineInvalidError()}</p> : null}
            <p
              id="goto-line-preview"
              className={`goto-line-preview is-${preview.tone}`}
              role="status"
              aria-live="polite"
            >
              {preview.text}
            </p>
          </>
        )}
        <div className="dialog-actions">
          <button type="button" className="btn btn-ghost" onClick={onClose}>
            取消
          </button>
          <button
            type="button"
            className="btn btn-primary"
            disabled={!hasDocument || !parsed}
            onClick={submit}
          >
            {gotoLineSubmitLabel()}
          </button>
        </div>
      </div>
    </div>
  )
}
