import { useEffect, useState } from 'react'
import { DIALECTS, dialectInfo, needsServerDatabase } from '@shared/types'
import { CONN_COLOR_TAGS } from '@shared/connGroups'
import type { ConnectionInput, Dialect } from '@shared/types'
import type { ImportPlanItem } from '@shared/connectionTransfer'
import { useWorkspace } from '../state/workspace'

export function Dialogs() {
  const ws = useWorkspace()
  if (!ws.dialog) return null
  if (ws.dialog.type === 'unsaved') {
    const { title, detail, onDecide } = ws.dialog
    return (
      <div className="overlay" role="presentation" onMouseDown={() => onDecide('keep')}>
        <div
          className="dialog"
          role="dialog"
          aria-modal="true"
          aria-labelledby="unsaved-title"
          onMouseDown={(event) => event.stopPropagation()}
        >
          <h2 id="unsaved-title">{title}</h2>
          <p className="dialog-copy">{detail}</p>
          <div className="dialog-actions">
            <button type="button" className="btn btn-ghost" onClick={() => onDecide('keep')}>
              继续编辑
            </button>
            <button type="button" className="btn btn-danger" onClick={() => onDecide('discard')}>
              丢弃更改
            </button>
          </div>
        </div>
      </div>
    )
  }
  if (ws.dialog.type === 'destructive') {
    const { reasons, preview, onDecide } = ws.dialog
    return (
      <div className="overlay" role="presentation" onMouseDown={() => onDecide('cancel')}>
        <div
          className="dialog dialog-danger"
          role="dialog"
          aria-modal="true"
          aria-labelledby="destructive-title"
          onMouseDown={(event) => event.stopPropagation()}
        >
          <h2 id="destructive-title">确认执行高风险 SQL</h2>
          <p className="dialog-copy">检测到可能造成数据丢失的语句，请确认后再执行。</p>
          <ul className="danger-list">
            {reasons.map((reason) => (
              <li key={reason}>{reason}</li>
            ))}
          </ul>
          <pre className="danger-preview">{preview}</pre>
          <div className="dialog-actions dialog-actions-wrap">
            <button type="button" className="btn btn-ghost" onClick={() => onDecide('cancel')}>
              取消
            </button>
            <button type="button" className="btn btn-ghost" onClick={() => onDecide('skip-session')}>
              本次会话不再询问并执行
            </button>
            <button type="button" className="btn btn-danger" onClick={() => onDecide('run')}>
              确认执行
            </button>
          </div>
        </div>
      </div>
    )
  }
  if (ws.dialog.type === 'delete') {
    const connection = ws.dialog.connection
    const inTxn = Boolean(ws.dialog.inTxn)
    return (
      <div className="overlay" role="presentation" onMouseDown={ws.closeDialog}>
        <div
          className="dialog"
          role="dialog"
          aria-modal="true"
          aria-labelledby="delete-title"
          onMouseDown={(event) => event.stopPropagation()}
        >
          <h2 id="delete-title">删除连接</h2>
          <p className="dialog-copy">
            删除「{connection.name}」。本地数据库文件会保留。
            {inTxn ? ' 该连接仍在事务中，删除前将回滚未提交更改。' : ''}
          </p>
          <div className="dialog-actions">
            <button type="button" className="btn btn-ghost" onClick={ws.closeDialog}>
              取消
            </button>
            <button type="button" className="btn btn-danger" onClick={() => void ws.deleteConnection(connection.id)}>
              删除
            </button>
          </div>
        </div>
      </div>
    )
  }
  if (ws.dialog.type === 'import') {
    return <ImportDialog path={ws.dialog.path} plan={ws.dialog.plan} />
  }
  return <ConnectionDialog />
}

function ImportDialog({ path, plan: initial }: { path: string; plan: ImportPlanItem[] }) {
  const ws = useWorkspace()
  const [plan, setPlan] = useState(initial)

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') ws.closeDialog()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [ws])

  const setDecision = (index: number, decision: ImportPlanItem['decision']) => {
    setPlan((rows) => rows.map((row, i) => (i === index ? { ...row, decision } : row)))
  }

  const counts = {
    replace: plan.filter((row) => row.decision === 'replace').length,
    keep: plan.filter((row) => row.decision === 'keep-both').length,
    skip: plan.filter((row) => row.decision === 'skip').length,
  }

  return (
    <div className="overlay" role="presentation" onMouseDown={ws.closeDialog}>
      <div
        className="dialog dialog-wide"
        role="dialog"
        aria-modal="true"
        aria-labelledby="import-title"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <h2 id="import-title">{path.toLowerCase().includes('config.db') ? '从旧版导入连接' : '导入连接'}</h2>
        <p className="dialog-copy">
          来自 <code className="inline-code">{path}</code>。
          {path.toLowerCase().includes('config.db')
            ? '旧版明文密码将写入本机系统密钥环（密封存储），不会以明文落盘。'
            : '密码仅含密封密文，不会写入明文。'}
        </p>
        <p className="dialog-meta">
          覆盖 {counts.replace} · 新建 {counts.keep} · 跳过 {counts.skip}
        </p>
        <ul className="import-list">
          {plan.map((item, index) => (
            <li key={`${item.incoming.id}:${index}`} className="import-item">
              <div className="import-main">
                <strong>{item.incoming.name}</strong>
                <span className="import-sub">
                  {item.incoming.dialect}
                  {item.incoming.host ? ` · ${item.incoming.host}` : ''}
                  {item.incoming.database ? ` / ${item.incoming.database}` : ''}
                  {item.incoming.filePath ? ` · ${item.incoming.filePath}` : ''}
                </span>
                <span className="import-reason">{item.reason}</span>
              </div>
              <select
                className="import-select"
                value={item.decision}
                onChange={(event) => setDecision(index, event.target.value as ImportPlanItem['decision'])}
                aria-label={`${item.incoming.name} 的导入方式`}
              >
                <option value="replace">覆盖</option>
                <option value="keep-both">新建</option>
                <option value="skip">跳过</option>
              </select>
            </li>
          ))}
        </ul>
        <div className="dialog-actions">
          <button type="button" className="btn btn-ghost" onClick={ws.closeDialog}>
            取消
          </button>
          <button
            type="button"
            className="btn btn-primary"
            disabled={plan.every((row) => row.decision === 'skip')}
            onClick={() => void ws.applyImportPlan(plan)}
          >
            确认导入
          </button>
        </div>
      </div>
    </div>
  )
}


function ConnectionDialog() {
  const ws = useWorkspace()
  const existing = ws.dialog?.type === 'connection' ? ws.dialog.connection : undefined
  const [name, setName] = useState(existing?.name ?? '')
  const [dialect, setDialect] = useState<Dialect>(existing?.dialect ?? 'sqlite')
  const [filePath, setFilePath] = useState(existing?.filePath ?? '')
  const [createFile, setCreateFile] = useState(true)
  const [host, setHost] = useState(existing?.host ?? '127.0.0.1')
  const [port, setPort] = useState(String(existing?.port ?? dialectInfo(existing?.dialect ?? 'sqlite').defaultPort ?? ''))
  const [database, setDatabase] = useState(existing?.database ?? '')
  const [username, setUsername] = useState(existing?.username ?? '')
  const [password, setPassword] = useState('')
  const [readOnly, setReadOnly] = useState(existing?.readOnly === true)
  const [groupId, setGroupId] = useState(existing?.groupId ?? '')
  const [colorTag, setColorTag] = useState(existing?.colorTag ?? '')
  const [error, setError] = useState('')
  const [probe, setProbe] = useState('')
  const [probing, setProbing] = useState(false)

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') ws.closeDialog()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [ws])

  const info = dialectInfo(dialect)
  const databaseLabel = dialect === 'redis' ? '数据库号' : dialect === 'oracle' ? '服务名' : '数据库'

  const buildInput = (): ConnectionInput => {
    const input: ConnectionInput = {
      id: existing?.id,
      name,
      dialect,
      createFile,
      password: password || undefined,
      readOnly,
      groupId: groupId || null,
      colorTag: colorTag || null,
    }
    if (dialect === 'sqlite') input.filePath = filePath
    else {
      input.host = host
      input.port = Number(port) || info.defaultPort
      input.database = database
      input.username = username
    }
    return input
  }

  const submit = async () => {
    setError('')
    setProbe('')
    try {
      await ws.saveConnection(buildInput())
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : '没有保存')
    }
  }

  const test = async () => {
    setProbing(true)
    setError('')
    setProbe('')
    try {
      const result = await ws.testConnection(buildInput())
      if (result.ok) setProbe('可以连接。')
      else setError(result.error ?? '连接失败')
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : '连接失败')
    } finally {
      setProbing(false)
    }
  }

  return (
    <div className="overlay" role="presentation" onMouseDown={ws.closeDialog}>
      <div
        className="dialog dialog-wide"
        role="dialog"
        aria-modal="true"
        aria-labelledby="connection-title"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <h2 id="connection-title">{existing ? '编辑连接' : '新建连接'}</h2>
        <label className="field">
          <span>名称</span>
          <input value={name} onChange={(event) => setName(event.target.value)} autoFocus placeholder="例如：订单库" />
        </label>
        <div className="field">
          <span>类型</span>
          <div className="dialect-list" role="listbox" aria-label="数据库类型">
            {DIALECTS.map((item) => (
              <button
                key={item.id}
                type="button"
                role="option"
                aria-selected={dialect === item.id}
                className={dialect === item.id ? 'dialect is-selected' : 'dialect'}
                onClick={() => {
                  const previous = dialectInfo(dialect)
                  setDialect(item.id)
                  setPort((current) => {
                    if (!current || current === String(previous.defaultPort ?? '')) {
                      return item.defaultPort ? String(item.defaultPort) : ''
                    }
                    return current
                  })
                }}
              >
                <span>{item.label}</span>
                <span className="tree-meta">{item.executable ? '可查询' : item.kv ? '可浏览' : '先保存'}</span>
              </button>
            ))}
          </div>
        </div>
        {dialect === 'sqlite' ? (
          <>
            <label className="field">
              <span>文件</span>
              <div className="file-row">
                <input value={filePath} onChange={(event) => setFilePath(event.target.value)} spellCheck={false} placeholder="数据库文件路径" />
                <button
                  type="button"
                  className="btn btn-ghost"
                  onClick={() => {
                    void ws.pickFile('open').then((path) => {
                      if (path) setFilePath(path)
                    })
                  }}
                >
                  选择
                </button>
              </div>
            </label>
            <label className="checkline">
              <input type="checkbox" checked={createFile} onChange={(event) => setCreateFile(event.target.checked)} />
              文件不存在时创建
            </label>
          </>
        ) : (
          <div className="field-grid">
            <label className="field">
              <span>主机</span>
              <input value={host} onChange={(event) => setHost(event.target.value)} spellCheck={false} />
            </label>
            <label className="field">
              <span>端口</span>
              <input value={port} onChange={(event) => setPort(event.target.value)} inputMode="numeric" />
            </label>
            <label className="field">
              <span>{databaseLabel}</span>
              <input value={database} onChange={(event) => setDatabase(event.target.value)} spellCheck={false} />
            </label>
            <label className="field">
              <span>用户名</span>
              <input value={username} onChange={(event) => setUsername(event.target.value)} spellCheck={false} />
            </label>
            <label className="field field-span">
              <span>密码</span>
              <input
                type="password"
                value={password}
                placeholder={existing?.hasPassword ? '已保存，留空则不修改' : ''}
                onChange={(event) => setPassword(event.target.value)}
                autoComplete="off"
              />
            </label>
          </div>
        )}
        <p className="field-hint">
          {ws.meta?.encryption === 'os'
            ? '密码用系统密钥环加密后保存在本机。'
            : '当前系统没有可用的密钥环，密码不会写入磁盘。'}
          {needsServerDatabase(dialect) && ' 服务器暂时连不上也可以先保存，失败原因会留在连接下面。'}
          {!info.executable && ' 此类型只保存连接，还不能查询。'}
        </p>
        {probe && <p className="field-ok">{probe}</p>}
        {error && <p className="field-error">{error}</p>}
                <label className="field">
          <span>分组</span>
          <select value={groupId} onChange={(e) => setGroupId(e.target.value)} aria-label="连接分组">
            <option value="">未分组</option>
            {ws.connectionGroups.map((group) => (
              <option key={group.id} value={group.id}>
                {group.name}
              </option>
            ))}
          </select>
        </label>
        <div className="field">
          <span>颜色标记</span>
          <div className="conn-color-picker" role="radiogroup" aria-label="颜色标记">
            <button
              type="button"
              className={!colorTag ? 'conn-color-swatch is-none is-active' : 'conn-color-swatch is-none'}
              aria-checked={!colorTag}
              role="radio"
              title="无"
              onClick={() => setColorTag('')}
            />
            {CONN_COLOR_TAGS.map((tag) => (
              <button
                key={tag.id}
                type="button"
                className={colorTag === tag.id ? 'conn-color-swatch is-active' : 'conn-color-swatch'}
                style={{ background: tag.color }}
                aria-checked={colorTag === tag.id}
                role="radio"
                title={tag.label}
                onClick={() => setColorTag(tag.id)}
              />
            ))}
          </div>
        </div>
        <label className="checkline">
          <input type="checkbox" checked={readOnly} onChange={(event) => setReadOnly(event.target.checked)} />
          只读连接（拦截写入 / DDL）
        </label>
<div className="dialog-actions">
          <button type="button" className="btn btn-ghost" onClick={ws.closeDialog}>
            取消
          </button>
          <button type="button" className="btn btn-ghost" disabled={probing} onClick={() => void test()}>
            {probing ? '测试中' : '测试'}
          </button>
          <button type="button" className="btn btn-primary" onClick={() => void submit()}>
            保存
          </button>
        </div>
      </div>
    </div>
  )
}
