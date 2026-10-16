import { useEffect, useState } from 'react'
import { DIALECTS, dialectInfo, needsServerDatabase } from '@shared/types'
import type { ConnectionInput, Dialect } from '@shared/types'
import { useWorkspace } from '../state/workspace'

export function Dialogs() {
  const ws = useWorkspace()
  if (!ws.dialog) return null
  if (ws.dialog.type === 'delete') {
    const connection = ws.dialog.connection
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
  return <ConnectionDialog />
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
