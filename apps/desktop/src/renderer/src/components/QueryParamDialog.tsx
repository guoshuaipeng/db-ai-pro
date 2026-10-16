import { useEffect, useMemo, useState } from 'react'
import { expandSnippet, extractSnippetVars } from '@shared/snippetVars'

export function QueryParamDialog({
  open,
  sql,
  title,
  initialValues,
  primaryLabel,
  onCancel,
  onConfirm,
}: {
  open: boolean
  sql: string
  title: string
  initialValues: Record<string, string>
  /** e.g. 运行 / 仅预览填写 */
  primaryLabel: string
  onCancel: () => void
  onConfirm: (values: Record<string, string>, writeBack: boolean) => void
}) {
  const vars = useMemo(() => extractSnippetVars(sql), [sql])
  const [values, setValues] = useState<Record<string, string>>(initialValues)
  const [writeBack, setWriteBack] = useState(false)

  useEffect(() => {
    if (!open) return
    setValues(initialValues)
    setWriteBack(false)
  }, [open, initialValues])

  useEffect(() => {
    if (!open) return
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault()
        onCancel()
      }
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [open, onCancel])

  if (!open) return null

  const preview = expandSnippet(sql, values)

  return (
    <div className="overlay snippet-var-overlay" role="presentation" onMouseDown={onCancel}>
      <div
        className="dialog dialog-wide snippet-var-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="query-param-title"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <h2 id="query-param-title">{title}</h2>
        <p className="dialog-copy">检测到 {'{{name}}'} 占位符。默认仅替换后执行，不改编辑器原文。</p>
        <div className="snippet-var-fields">
          {vars.map((varName, index) => (
            <label key={varName} className="field">
              <span>{`{{${varName}}}`}</span>
              <input
                className="fav-input"
                value={values[varName] ?? ''}
                autoFocus={index === 0}
                spellCheck={false}
                onChange={(event) =>
                  setValues((prev) => ({ ...prev, [varName]: event.target.value }))
                }
                onKeyDown={(event) => {
                  if (event.key === 'Enter') {
                    event.preventDefault()
                    onConfirm(values, writeBack)
                  }
                }}
              />
            </label>
          ))}
        </div>
        <pre className="snippet-var-preview" aria-label="替换预览">
          {preview}
        </pre>
        <label className="query-param-writeback">
          <input
            type="checkbox"
            checked={writeBack}
            onChange={(event) => setWriteBack(event.target.checked)}
          />
          <span>同时写回编辑器</span>
        </label>
        <div className="dialog-actions">
          <button type="button" className="btn btn-ghost" onClick={onCancel}>
            取消
          </button>
          <button type="button" className="btn btn-primary" onClick={() => onConfirm(values, writeBack)}>
            {primaryLabel}
          </button>
        </div>
      </div>
    </div>
  )
}
