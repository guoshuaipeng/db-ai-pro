import {
  buildResultSummaryParts,
  formatResultSummaryClipboard,
  resultSummaryCopiedToast,
  type ResultSummaryInput,
} from '@shared/resultSummary'

type ResultSummaryBarProps = ResultSummaryInput & {
  slowThresholdMs?: number
  onToast?: (tone: 'info' | 'error' | 'success', text: string) => void
}

export function ResultSummaryBar(props: ResultSummaryBarProps) {
  const parts = buildResultSummaryParts(props)
  if (parts.length === 0) return null

  const copySummary = () => {
    const text = formatResultSummaryClipboard(parts)
    if (!text) {
      props.onToast?.('info', resultSummaryCopiedToast(0))
      return
    }
    void navigator.clipboard.writeText(text).then(
      () => props.onToast?.('success', resultSummaryCopiedToast(parts.length)),
      () => props.onToast?.('error', '复制失败'),
    )
  }

  return (
    <div className="result-summary-bar" role="status" aria-label="结果摘要">
      <div className="result-summary-chips">
        {parts.map((part) => (
          <span
            key={part.key}
            className={part.tone ? `result-summary-chip is-${part.tone}` : 'result-summary-chip'}
            title={
              part.key === 'slow' && props.slowThresholdMs
                ? `超过慢查询阈值 ${props.slowThresholdMs} ms`
                : part.key === 'shown'
                  ? '已应用结果筛选 / 列筛选'
                  : part.key === 'cols'
                    ? '当前结果集列数'
                    : undefined
            }
          >
            {part.text}
          </span>
        ))}
      </div>
      <button
        type="button"
        className="btn btn-ghost tiny-btn result-summary-copy"
        title="复制结果摘要"
        onClick={copySummary}
      >
        复制摘要
      </button>
    </div>
  )
}
