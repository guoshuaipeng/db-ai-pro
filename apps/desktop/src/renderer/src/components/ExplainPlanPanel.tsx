import { useMemo } from 'react'
import { formatElapsedMs } from '@shared/slowQuery'
import {
  explainEmptyBody,
  explainEmptyTitle,
  explainPlanCopiedToast,
  explainReexplainLabel,
  summarizeExplainText,
} from '@shared/explain'
import { EmptyState } from './EmptyState'

type ExplainPlanPanelProps = {
  message: string
  elapsedMs?: number | null
  onToast?: (tone: 'info' | 'error' | 'success', text: string) => void
  onReexplain?: () => void
}

export function ExplainPlanPanel({
  message,
  elapsedMs,
  onToast,
  onReexplain,
}: ExplainPlanPanelProps) {
  const summary = useMemo(() => summarizeExplainText(message), [message])

  const copyPlan = () => {
    const text = (message ?? '').replace(/\r\n/g, '\n').trim()
    if (!text || summary.isEmpty) {
      onToast?.('info', '没有可复制的执行计划')
      return
    }
    void navigator.clipboard.writeText(text).then(
      () => onToast?.('success', explainPlanCopiedToast()),
      () => onToast?.('error', '复制失败'),
    )
  }

  if (summary.isEmpty) {
    return (
      <EmptyState
        compact
        kicker="执行计划"
        title={explainEmptyTitle()}
        body={explainEmptyBody()}
        actions={
          onReexplain ? (
            <button type="button" className="btn btn-ghost" onClick={onReexplain}>
              {explainReexplainLabel()}
            </button>
          ) : null
        }
      />
    )
  }

  return (
    <div className="explain-plan-panel" aria-label="执行计划">
      <div className="explain-plan-head">
        <div className="explain-plan-title-row">
          <span className="explain-plan-kicker">执行计划</span>
          <span className="explain-plan-status">{summary.statusLabel}</span>
          {typeof elapsedMs === 'number' && Number.isFinite(elapsedMs) ? (
            <span className="explain-plan-elapsed">{formatElapsedMs(elapsedMs)}</span>
          ) : null}
        </div>
        {summary.warnings.length > 0 ? (
          <div className="explain-plan-warnings" aria-label="计划提示">
            {summary.warnings.map((warning) => (
              <span key={warning} className="explain-plan-warn-chip">
                {warning}
              </span>
            ))}
          </div>
        ) : (
          <p className="explain-plan-ok-hint">未检测到明显的全表 / 顺序扫描提示。</p>
        )}
      </div>
      <pre className="message-log plan-log explain-plan-body" tabIndex={-1}>
        {message}
      </pre>
      <div className="explain-plan-actions">
        <button type="button" className="btn btn-ghost" onClick={copyPlan}>
          复制计划
        </button>
        {onReexplain ? (
          <button type="button" className="btn btn-ghost" onClick={onReexplain}>
            {explainReexplainLabel()}
          </button>
        ) : null}
      </div>
    </div>
  )
}
