import { useMemo, useState } from 'react'
import { generateSampleFill } from '@shared/sampleData'
import type { TableStructure } from '@shared/tableStructure'
import { useWorkspace } from '../state/workspace'

export function SampleFillDialog({
  structure,
  onClose,
}: {
  structure: TableStructure
  onClose: () => void
}) {
  const ws = useWorkspace()
  const [count, setCount] = useState(5)
  const [busy, setBusy] = useState(false)
  const plan = useMemo(
    () =>
      generateSampleFill({
        tableName: structure.tableName,
        dialect: structure.dialect,
        columns: structure.columns,
        count,
        seed: 14,
      }),
    [structure, count],
  )

  const writeEditor = () => {
    if (!ws.assertWritable('样例填充')) return
    ws.openSqlTab(`样例 ${structure.tableName}`, plan.sql)
    onClose()
  }

  const runNow = async () => {
    if (!ws.assertWritable('样例填充')) return
    setBusy(true)
    try {
      ws.openSqlTab(`样例 ${structure.tableName}`, plan.sql)
      onClose()
      ws.closeTableStructure()
      await ws.runSqlText(plan.sql)
    } finally {
      setBusy(false)
    }
  }

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
            <p className="structure-kicker">样例数据</p>
            <h2 id="sample-title">填充 {structure.tableName}</h2>
          </div>
          <button type="button" className="btn btn-ghost tiny-btn" onClick={onClose}>
            关闭
          </button>
        </header>
        <div className="sample-body">
          <p className="settings-lead">
            按列类型生成可预览的 INSERT。默认跳过自增主键。执行前可再确认；写入编辑器后也可手动改再运行。
          </p>
          <label className="field">
            <span>行数（1–200）</span>
            <input
              type="number"
              min={1}
              max={200}
              value={count}
              onChange={(event) => setCount(Number(event.target.value) || 1)}
            />
          </label>
          <p className="field-hint">将写入列：{plan.columns.join(', ') || '（无）'}</p>
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
                {plan.rows.slice(0, 8).map((row, index) => (
                  <tr key={index}>
                    {plan.columns.map((column) => (
                      <td key={column}>{row[column] == null ? 'NULL' : String(row[column])}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <pre className="structure-ddl-code sample-sql">{plan.sql}</pre>
        </div>
        <div className="dialog-actions sample-actions">
          <button type="button" className="btn btn-ghost" onClick={onClose}>
            取消
          </button>
          <button type="button" className="btn btn-ghost" onClick={writeEditor}>
            写入编辑器
          </button>
          <button type="button" className="btn btn-primary" disabled={busy || !plan.sql} onClick={() => void runNow()}>
            {busy ? '执行中…' : '确认执行'}
          </button>
        </div>
      </div>
    </div>
  )
}
