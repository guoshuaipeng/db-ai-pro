import { useEffect, useMemo, useState } from 'react'
import { generateSampleFill } from '@shared/sampleData'
import type { TableStructure } from '@shared/tableStructure'
import {
  SAMPLE_COUNT_PRESETS,
  clampSampleCount,
  sampleFillColumnsHint,
  sampleFillCopiedToast,
  sampleFillCountLabel,
  sampleFillCopySqlLabel,
  sampleFillEditorToast,
  sampleFillEmptyBody,
  sampleFillEmptyTitle,
  sampleFillKicker,
  sampleFillLead,
  sampleFillPreviewNote,
  sampleFillReshuffleLabel,
  sampleFillReshuffleToast,
  sampleFillRunLabel,
  sampleFillRunToast,
  sampleFillSkippedHint,
  sampleFillTitle,
  sampleFillWriteEditorLabel,
} from '@shared/sampleFillUi'
import { useWorkspace } from '../state/workspace'
import { EmptyState } from './EmptyState'

export function SampleFillDialog({
  structure,
  onClose,
}: {
  structure: TableStructure
  onClose: () => void
}) {
  const ws = useWorkspace()
  const [count, setCount] = useState(5)
  const [seed, setSeed] = useState(14)
  const [busy, setBusy] = useState(false)

  const plan = useMemo(
    () =>
      generateSampleFill({
        tableName: structure.tableName,
        dialect: structure.dialect,
        columns: structure.columns,
        count,
        seed,
      }),
    [structure, count, seed],
  )

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault()
        onClose()
      }
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [onClose])

  const empty = plan.columns.length === 0 || !plan.sql

  const writeEditor = () => {
    if (empty) return
    if (!ws.assertWritable('样例填充')) return
    ws.openSqlTab(`样例 ${structure.tableName}`, plan.sql)
    ws.pushToast('success', sampleFillEditorToast(plan.count))
    onClose()
  }

  const copySql = () => {
    if (empty) {
      ws.pushToast('info', '没有可复制的 SQL')
      return
    }
    void navigator.clipboard.writeText(plan.sql).then(
      () => ws.pushToast('success', sampleFillCopiedToast(plan.count)),
      () => ws.pushToast('error', '复制失败'),
    )
  }

  const reshuffle = () => {
    setSeed((value) => (value + 17) % 1_000_000_007)
    ws.pushToast('info', sampleFillReshuffleToast())
  }

  const runNow = async () => {
    if (empty) return
    if (!ws.assertWritable('样例填充')) return
    setBusy(true)
    try {
      ws.openSqlTab(`样例 ${structure.tableName}`, plan.sql)
      ws.pushToast('info', sampleFillRunToast(plan.count))
      onClose()
      ws.closeTableStructure()
      await ws.runSqlText(plan.sql)
    } finally {
      setBusy(false)
    }
  }

  const previewRows = plan.rows.slice(0, 8)
  const skippedHint = sampleFillSkippedHint(plan.skippedColumns)

  return (
    <div className="overlay sample-overlay" role="presentation" onMouseDown={onClose}>
      <div
        className="sample-shell"
        role="dialog"
        aria-modal="true"
        aria-labelledby="sample-title"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <header className="sample-head">
          <div>
            <p className="structure-kicker">{sampleFillKicker()}</p>
            <h2 id="sample-title">{sampleFillTitle(structure.tableName)}</h2>
          </div>
          <button type="button" className="btn btn-ghost tiny-btn" onClick={onClose}>
            关闭
          </button>
        </header>
        <div className="sample-body">
          {empty ? (
            <EmptyState
              kicker={sampleFillKicker()}
              title={sampleFillEmptyTitle()}
              body={sampleFillEmptyBody()}
            />
          ) : (
            <>
              <p className="settings-lead">{sampleFillLead()}</p>
              <label className="field">
                <span>{sampleFillCountLabel()}</span>
                <input
                  type="number"
                  min={1}
                  max={200}
                  value={count}
                  aria-label={sampleFillCountLabel()}
                  onChange={(event) => setCount(clampSampleCount(Number(event.target.value) || 1))}
                />
              </label>
              <div className="sample-presets" role="group" aria-label="常用行数">
                {SAMPLE_COUNT_PRESETS.map((preset) => (
                  <button
                    key={preset}
                    type="button"
                    className={count === preset ? 'sample-preset is-active' : 'sample-preset'}
                    aria-pressed={count === preset}
                    onClick={() => setCount(preset)}
                  >
                    {preset} 行
                  </button>
                ))}
                <button type="button" className="btn btn-ghost tiny-btn" onClick={reshuffle}>
                  {sampleFillReshuffleLabel()}
                </button>
              </div>
              <p className="field-hint">{sampleFillColumnsHint(plan.columns)}</p>
              {skippedHint ? <p className="field-hint sample-skipped">{skippedHint}</p> : null}
              <p className="sample-preview-note">{sampleFillPreviewNote(previewRows.length, plan.count)}</p>
              <div className="sample-preview-wrap">
                <table className="structure-table sample-preview-table">
                  <thead>
                    <tr>
                      {plan.columns.map((column) => (
                        <th key={column} scope="col">
                          {column}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {previewRows.map((row, index) => (
                      <tr key={index}>
                        {plan.columns.map((column) => (
                          <td key={column}>{row[column] == null ? 'NULL' : String(row[column])}</td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <pre className="structure-ddl-code sample-sql" aria-label="样例 SQL">
                {plan.sql}
              </pre>
            </>
          )}
        </div>
        <div className="dialog-actions sample-actions">
          <button type="button" className="btn btn-ghost" onClick={onClose}>
            取消
          </button>
          <button type="button" className="btn btn-ghost" disabled={empty} onClick={copySql}>
            {sampleFillCopySqlLabel()}
          </button>
          <button type="button" className="btn btn-ghost" disabled={empty} onClick={writeEditor}>
            {sampleFillWriteEditorLabel()}
          </button>
          <button
            type="button"
            className="btn btn-primary"
            disabled={busy || empty}
            onClick={() => void runNow()}
          >
            {sampleFillRunLabel(busy)}
          </button>
        </div>
      </div>
    </div>
  )
}
