import { useEffect, useMemo, useState } from 'react'
import { expandSnippet, extractSnippetVars } from '@shared/snippetVars'
import {
  clearQueryParamValues,
  countFilledParams,
  queryParamClearLabel,
  queryParamCopyPreviewLabel,
  queryParamEmptyHint,
  queryParamFieldLabel,
  queryParamKicker,
  queryParamLead,
  queryParamNoVarsBody,
  queryParamNoVarsTitle,
  queryParamPreviewCopiedToast,
  queryParamPreviewLabel,
  queryParamProgress,
  queryParamWriteBackLabel,
} from '@shared/queryParamUi'
import { useWorkspace } from '../state/workspace'
import { EmptyState } from './EmptyState'

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
  const ws = useWorkspace()
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
  const filled = countFilledParams(vars, values)
  const emptyCount = vars.length - filled
  const emptyHint = queryParamEmptyHint(emptyCount)

  const copyPreview = () => {
    void navigator.clipboard.writeText(preview).then(
      () => ws.pushToast('success', queryParamPreviewCopiedToast()),
      () => ws.pushToast('error', '复制失败'),
    )
  }

  const confirm = () => onConfirm(values, writeBack)

  return (
    <div className="overlay snippet-var-overlay" role="presentation" onMouseDown={onCancel}>
      <div
        className="dialog dialog-wide snippet-var-dialog query-param-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="query-param-title"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <h2 id="query-param-title">{title}</h2>
        <p className="dialog-copy">{queryParamLead()}</p>

        {vars.length === 0 ? (
          <EmptyState
            compact
            kicker={queryParamKicker()}
            title={queryParamNoVarsTitle()}
            body={queryParamNoVarsBody()}
          />
        ) : (
          <>
            <div className="query-param-toolbar">
              <span className="query-param-progress">{queryParamProgress(filled, vars.length)}</span>
              {emptyHint ? <span className="query-param-empty-hint">{emptyHint}</span> : null}
              <button
                type="button"
                className="btn btn-ghost tiny-btn"
                onClick={() => setValues(clearQueryParamValues(vars))}
              >
                {queryParamClearLabel()}
              </button>
              <button type="button" className="btn btn-ghost tiny-btn" onClick={copyPreview}>
                {queryParamCopyPreviewLabel()}
              </button>
            </div>
            <div className="snippet-var-fields">
              {vars.map((varName, index) => {
                const empty = (values[varName] ?? '').trim() === ''
                return (
                  <label key={varName} className={empty ? 'field is-param-empty' : 'field'}>
                    <span>{queryParamFieldLabel(varName)}</span>
                    <input
                      className="fav-input"
                      value={values[varName] ?? ''}
                      autoFocus={index === 0}
                      spellCheck={false}
                      aria-invalid={empty}
                      onChange={(event) =>
                        setValues((prev) => ({ ...prev, [varName]: event.target.value }))
                      }
                      onKeyDown={(event) => {
                        if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
                          event.preventDefault()
                          confirm()
                          return
                        }
                        if (event.key === 'Enter') {
                          event.preventDefault()
                          confirm()
                        }
                      }}
                    />
                  </label>
                )
              })}
            </div>
            <p className="query-param-preview-label">{queryParamPreviewLabel()}</p>
            <pre className="snippet-var-preview" aria-label={queryParamPreviewLabel()}>
              {preview}
            </pre>
            <label className="query-param-writeback">
              <input
                type="checkbox"
                checked={writeBack}
                onChange={(event) => setWriteBack(event.target.checked)}
              />
              <span>{queryParamWriteBackLabel()}</span>
            </label>
          </>
        )}

        <div className="dialog-actions">
          <button type="button" className="btn btn-ghost" onClick={onCancel}>
            取消
          </button>
          <button
            type="button"
            className="btn btn-primary"
            disabled={vars.length === 0}
            onClick={confirm}
          >
            {primaryLabel}
          </button>
        </div>
      </div>
    </div>
  )
}
