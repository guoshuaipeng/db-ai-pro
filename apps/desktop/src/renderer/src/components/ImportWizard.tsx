import { useEffect, useMemo, useRef, useState } from 'react'
import {
  autoMapColumns,
  buildInsertBatches,
  buildSqliteCreateTable,
  mappedPreviewRows,
  type ImportColumnMapping,
  type ImportSheetData,
} from '@shared/importPlan'
import { getApi } from '../bridge'
import { useWorkspace } from '../state/workspace'

type Step = 'file' | 'target' | 'map' | 'preview' | 'progress'

export function ImportWizard() {
  const ws = useWorkspace()
  const target = ws.importTarget
  const [step, setStep] = useState<Step>('file')
  const [sheet, setSheet] = useState<ImportSheetData | null>(null)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [mode, setMode] = useState<'existing' | 'create'>('existing')
  const [tableName, setTableName] = useState('')
  const [mapping, setMapping] = useState<ImportColumnMapping[]>([])
  const [targetColumns, setTargetColumns] = useState<string[]>([])
  const [progress, setProgress] = useState({ done: 0, total: 0, message: '' })
  const cancelRef = useRef(false)
  const requestRef = useRef<string | null>(null)

  const tableOptions = useMemo(() => {
    const names: string[] = []
    const walk = (nodes: typeof ws.schema) => {
      for (const node of nodes) {
        if (node.kind === 'table' && node.connectionId === target?.connectionId && node.tableName) {
          names.push(node.tableName)
        }
        if (node.children) walk(node.children)
      }
    }
    walk(ws.schema)
    return names.sort((a, b) => a.localeCompare(b, 'zh-CN'))
  }, [ws.schema, target?.connectionId])

  const dialect = ws.activeConnection?.dialect ?? target?.dialect ?? 'sqlite'
  const canCreate = dialect === 'sqlite'

  useEffect(() => {
    if (!target) return
    setStep('file')
    setSheet(null)
    setError('')
    setBusy(false)
    setMode(target.tableName ? 'existing' : canCreate ? 'create' : 'existing')
    setTableName(target.tableName ?? '')
    setMapping([])
    setTargetColumns([])
    setProgress({ done: 0, total: 0, message: '' })
    cancelRef.current = false
  }, [target?.connectionId, target?.tableName, target?.nonce, canCreate])

  useEffect(() => {
    if (!target) return
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && step !== 'progress') {
        event.preventDefault()
        ws.closeImportWizard()
      }
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [target, step, ws])

  if (!target) return null

  const pickFile = async () => {
    setBusy(true)
    setError('')
    try {
      const picked = await getApi().sql.importPick()
      if ('cancelled' in picked) return
      const data = await getApi().sql.importRead(picked.path)
      setSheet(data)
      const initialTable = target.tableName || tableName || data.fileName.replace(/\.[^.]+$/, '').replace(/[^\w\u4e00-\u9fff]+/g, '_') || 'imported'
      setTableName(initialTable)
      if (target.tableName || (!canCreate && tableOptions[0])) {
        setMode('existing')
        const name = target.tableName || tableOptions[0]
        setTableName(name)
        const structure = await ws.loadTableStructure(target.connectionId, name)
        const cols = structure.columns.map((column) => column.name)
        setTargetColumns(cols)
        setMapping(autoMapColumns(data.headers, cols))
      } else {
        setMode(canCreate ? 'create' : 'existing')
        setTargetColumns(data.headers)
        setMapping(data.headers.map((header) => ({ source: header, target: header })))
      }
      setStep('target')
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : '无法读取文件')
    } finally {
      setBusy(false)
    }
  }

  const prepareMapping = async () => {
    if (!sheet) return
    setError('')
    const name = tableName.trim()
    if (!name) {
      setError('请填写目标表名')
      return
    }
    if (mode === 'existing') {
      try {
        const structure = await ws.loadTableStructure(target.connectionId, name)
        const cols = structure.columns.map((column) => column.name)
        setTargetColumns(cols)
        setMapping(autoMapColumns(sheet.headers, cols))
      } catch (reason) {
        setError(reason instanceof Error ? reason.message : '无法读取目标表结构')
        return
      }
    } else {
      setTargetColumns(sheet.headers)
      setMapping(sheet.headers.map((header) => ({ source: header, target: header })))
    }
    setStep('map')
  }

  const activeMapped = mapping.filter((item) => item.target)
  const preview = sheet ? mappedPreviewRows(sheet.rows, mapping, 8) : []

  const runImport = async () => {
    if (!sheet || !activeMapped.length) {
      setError('请至少映射一列')
      return
    }
    const name = tableName.trim()
    cancelRef.current = false
    setStep('progress')
    setProgress({ done: 0, total: 0, message: '准备中…' })
    try {
      const statements: string[] = []
      if (mode === 'create') {
        statements.push(buildSqliteCreateTable(name, sheet.headers, sheet.rows))
      }
      const batches = buildInsertBatches({
        tableName: name,
        dialect,
        mapping,
        rows: sheet.rows,
        batchSize: 40,
      })
      statements.push(...batches)
      setProgress({ done: 0, total: statements.length, message: '开始导入…' })

      for (let i = 0; i < statements.length; i += 1) {
        if (cancelRef.current) {
          const requestId = requestRef.current
          if (requestId) void getApi().sql.cancel(requestId)
          setProgress((current) => ({ ...current, message: '已取消' }))
          return
        }
        const requestId = crypto.randomUUID()
        requestRef.current = requestId
        setProgress({
          done: i,
          total: statements.length,
          message: `执行批次 ${i + 1} / ${statements.length}`,
        })
        const prefs = await getApi().prefs.get()
        const timeoutMs = prefs.queryTimeoutSec > 0 ? prefs.queryTimeoutSec * 1000 : 0
        const results = await getApi().sql.execute({
          connectionId: target.connectionId,
          sql: statements[i],
          requestId,
          timeoutMs,
        })
        const failed = results.find((item) => !item.ok)
        if (failed) throw new Error(failed.error ?? '导入失败')
        setProgress({
          done: i + 1,
          total: statements.length,
          message: `已完成 ${i + 1} / ${statements.length}`,
        })
      }
      setProgress((current) => ({ ...current, message: `导入完成 · ${sheet.rows.length} 行` }))
      await ws.refreshConnections(target.connectionId)
      ws.openTableQuery(target.connectionId, name)
      ws.closeImportWizard()
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : '导入失败')
      setStep('preview')
    } finally {
      requestRef.current = null
    }
  }

  const cancelImport = () => {
    cancelRef.current = true
    const requestId = requestRef.current
    if (requestId) void getApi().sql.cancel(requestId)
  }

  return (
    <div className="overlay import-overlay" role="presentation" onMouseDown={() => step !== 'progress' && ws.closeImportWizard()}>
      <div
        className="import-shell"
        role="dialog"
        aria-modal="true"
        aria-labelledby="import-title"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <header className="import-head">
          <div>
            <p className="structure-kicker">导入向导</p>
            <h2 id="import-title">CSV / Excel → 表</h2>
          </div>
          <button type="button" className="btn btn-ghost tiny-btn" disabled={step === 'progress'} onClick={ws.closeImportWizard}>
            关闭
          </button>
        </header>

        <ol className="import-steps" aria-label="步骤">
          {(
            [
              ['file', '选文件'],
              ['target', '目标表'],
              ['map', '列映射'],
              ['preview', '预览'],
              ['progress', '执行'],
            ] as const
          ).map(([id, label]) => (
            <li key={id} className={step === id ? 'is-active' : ''}>
              {label}
            </li>
          ))}
        </ol>

        <div className="import-body">
          {error && <p className="field-error">{error}</p>}

          {step === 'file' && (
            <div className="import-card">
              <p className="settings-lead">选择 CSV / TXT / XLSX。最多读取 10,000 行。导入前可预览并映射列。</p>
              <button type="button" className="btn btn-primary" disabled={busy} onClick={() => void pickFile()}>
                {busy ? '读取中…' : '选择文件'}
              </button>
            </div>
          )}

          {step === 'target' && sheet && (
            <div className="import-card">
              <p className="field-hint">
                文件：{sheet.fileName} · {sheet.format.toUpperCase()} · {sheet.rows.length} 行 · {sheet.headers.length} 列
              </p>
              <div className="density-grid" role="radiogroup" aria-label="导入模式">
                <button
                  type="button"
                  role="radio"
                  aria-checked={mode === 'existing'}
                  className={mode === 'existing' ? 'density-card is-active' : 'density-card'}
                  onClick={() => setMode('existing')}
                >
                  <strong>导入到已有表</strong>
                  <span>按列映射插入行。</span>
                </button>
                <button
                  type="button"
                  role="radio"
                  aria-checked={mode === 'create'}
                  className={mode === 'create' ? 'density-card is-active' : 'density-card'}
                  disabled={!canCreate}
                  onClick={() => canCreate && setMode('create')}
                >
                  <strong>新建表（SQLite）</strong>
                  <span>{canCreate ? '根据表头推断类型并 CREATE。' : '仅 SQLite 支持一键建表。'}</span>
                </button>
              </div>
              <label className="field">
                <span>目标表名</span>
                {mode === 'existing' && tableOptions.length > 0 ? (
                  <select value={tableName} onChange={(event) => setTableName(event.target.value)}>
                    {tableOptions.map((name) => (
                      <option key={name} value={name}>
                        {name}
                      </option>
                    ))}
                  </select>
                ) : (
                  <input value={tableName} onChange={(event) => setTableName(event.target.value)} spellCheck={false} />
                )}
              </label>
              <div className="dialog-actions">
                <button type="button" className="btn btn-ghost" onClick={() => setStep('file')}>
                  上一步
                </button>
                <button type="button" className="btn btn-primary" onClick={() => void prepareMapping()}>
                  下一步
                </button>
              </div>
            </div>
          )}

          {step === 'map' && sheet && (
            <div className="import-card">
              <p className="settings-lead">把源列映射到目标列。未映射的列会被跳过。</p>
              <div className="import-map-wrap">
                <table className="structure-table">
                  <thead>
                    <tr>
                      <th scope="col">源列</th>
                      <th scope="col">目标列</th>
                    </tr>
                  </thead>
                  <tbody>
                    {mapping.map((item, index) => (
                      <tr key={item.source}>
                        <td>
                          <code>{item.source}</code>
                        </td>
                        <td>
                          <select
                            value={item.target ?? ''}
                            onChange={(event) => {
                              const value = event.target.value
                              setMapping((rows) =>
                                rows.map((row, i) => (i === index ? { ...row, target: value || null } : row)),
                              )
                            }}
                          >
                            <option value="">（跳过）</option>
                            {(mode === 'create' ? sheet.headers : targetColumns).map((header) => (
                              <option key={header} value={header}>
                                {header}
                              </option>
                            ))}
                          </select>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="dialog-actions">
                <button type="button" className="btn btn-ghost" onClick={() => setStep('target')}>
                  上一步
                </button>
                <button
                  type="button"
                  className="btn btn-primary"
                  disabled={!activeMapped.length}
                  onClick={() => setStep('preview')}
                >
                  预览
                </button>
              </div>
            </div>
          )}

          {step === 'preview' && sheet && (
            <div className="import-card">
              <p className="settings-lead">
                将向 <code>{tableName}</code> {mode === 'create' ? '建表并' : ''}写入 {sheet.rows.length} 行 · 映射{' '}
                {activeMapped.length} 列。批量 INSERT 执行中可取消。
              </p>
              <div className="sample-preview-wrap">
                <table className="structure-table sample-preview-table">
                  <thead>
                    <tr>
                      {activeMapped.map((item) => (
                        <th key={item.target!} scope="col">
                          {item.target}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {preview.map((row, index) => (
                      <tr key={index}>
                        {activeMapped.map((item) => (
                          <td key={item.target!}>{row[item.target!] || 'NULL'}</td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="dialog-actions">
                <button type="button" className="btn btn-ghost" onClick={() => setStep('map')}>
                  上一步
                </button>
                <button type="button" className="btn btn-primary" onClick={() => void runImport()}>
                  确认导入
                </button>
              </div>
            </div>
          )}

          {step === 'progress' && (
            <div className="import-card">
              <p className="import-progress-label">{progress.message}</p>
              <div className="import-progress-track" aria-valuemin={0} aria-valuemax={progress.total || 1} aria-valuenow={progress.done}>
                <div
                  className="import-progress-bar"
                  style={{ width: `${progress.total ? Math.min(100, (100 * progress.done) / progress.total) : 0}%` }}
                />
              </div>
              <div className="dialog-actions">
                <button type="button" className="btn btn-danger" onClick={cancelImport}>
                  取消导入
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
