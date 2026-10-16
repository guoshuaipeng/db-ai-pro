import {
  formatQueryErrorClipboard,
  parseQueryErrorMessage,
  queryErrorCopiedToast,
  queryErrorGotoToast,
  queryErrorMetaLabel,
} from '@shared/queryError'
import { emitDataai } from '../appEvents'

type QueryErrorPanelProps = {
  message: string
  sql?: string
  onToast?: (tone: 'info' | 'error' | 'success', text: string) => void
  onRepair?: (sql: string, error: string) => void
}

export function QueryErrorPanel({ message, sql = '', onToast, onRepair }: QueryErrorPanelProps) {
  const parsed = parseQueryErrorMessage(message)
  const meta = queryErrorMetaLabel(parsed)

  const copyError = () => {
    const text = formatQueryErrorClipboard(parsed)
    void navigator.clipboard.writeText(text).then(
      () => onToast?.('success', queryErrorCopiedToast()),
      () => onToast?.('error', '复制失败'),
    )
  }

  const gotoLine = () => {
    if (parsed.line == null) return
    emitDataai('dataai:goto-line', {
      line: parsed.line,
      column: parsed.column ?? 1,
    })
    onToast?.('info', queryErrorGotoToast(parsed.line))
  }

  return (
    <div className="query-error-panel" role="alert" aria-label="查询错误">
      <div className="query-error-head">
        <span className="query-error-kicker">查询失败</span>
        <h3 className="query-error-title">{parsed.title}</h3>
        {meta ? <p className="query-error-meta">{meta}</p> : null}
      </div>
      <pre className="message-log query-error-detail" tabIndex={-1}>
        {parsed.detail}
      </pre>
      <p className="query-error-hint">{parsed.hint}</p>
      <div className="query-error-actions">
        <button type="button" className="btn btn-ghost" onClick={copyError}>
          复制错误
        </button>
        {parsed.line != null ? (
          <button type="button" className="btn btn-ghost" onClick={gotoLine}>
            转到第 {parsed.line} 行
          </button>
        ) : null}
        <button
          type="button"
          className="btn btn-ghost"
          onClick={() => emitDataai('dataai:request-run')}
        >
          再次运行
        </button>
        {onRepair ? (
          <button
            type="button"
            className="btn btn-primary"
            onClick={() => onRepair(sql, parsed.detail)}
          >
            请助手修复
          </button>
        ) : null}
      </div>
    </div>
  )
}
