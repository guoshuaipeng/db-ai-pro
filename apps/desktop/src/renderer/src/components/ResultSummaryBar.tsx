import { buildResultSummaryParts, type ResultSummaryInput } from '@shared/resultSummary'

export function ResultSummaryBar(props: ResultSummaryInput & { slowThresholdMs?: number }) {
  const parts = buildResultSummaryParts(props)
  if (parts.length === 0) return null

  return (
    <div className="result-summary-bar" role="status" aria-label="结果摘要">
      {parts.map((part) => (
        <span
          key={part.key}
          className={part.tone ? `result-summary-chip is-${part.tone}` : 'result-summary-chip'}
          title={
            part.key === 'slow' && props.slowThresholdMs
              ? `超过慢查询阈值 ${props.slowThresholdMs} ms`
              : part.key === 'shown'
                ? '已应用结果筛选 / 列筛选'
                : undefined
          }
        >
          {part.text}
        </span>
      ))}
    </div>
  )
}
