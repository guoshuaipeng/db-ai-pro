import { useEffect, useMemo, useRef, useState } from 'react'
import { dirtyDiscardLabel, dirtyKeepLabel } from '@shared/tabDirty'
import { DIALECTS, dialectInfo, needsServerDatabase } from '@shared/types'
import { CONN_COLOR_TAGS } from '@shared/connGroups'
import type { ConnectionInput, ConnectionPublic, Dialect } from '@shared/types'
import type { ImportPlanItem } from '@shared/connectionTransfer'
import { getApi } from '../bridge'
import { useWorkspace } from '../state/workspace'
import {
  checkFilteredDatabases,
  dbVisibilityEmptyBody,
  filterDatabaseNames,
  invertDatabaseChecked,
  keepOnlyFilteredDatabases,
  whitelistForSave,
} from '@shared/dbVisibility'
import {
  dbVisibilityCheckListLabel,
  dbVisibilityCheckListTitle,
  dbVisibilityCheckboxAria,
  dbVisibilityDialogCopy,
  dbVisibilityListAria,
  dbVisibilityNoneCheckedWarning,
  dbVisibilityOnlyListLabel,
  dbVisibilityOnlyListTitle,
  dbVisibilitySelectionSummary,
} from '@shared/dbVisibilityUi'
import {
  connectionDialectHelp,
  connectionNamePlaceholder,
  validateConnectionDraft,
} from '@shared/connectionDraft'
import {
  destructiveCancelLabel,
  destructiveCopyPreviewFailToast,
  destructiveCopyPreviewLabel,
  destructiveCopyPreviewToast,
  destructiveDialogBody,
  destructiveDialogTitle,
  destructiveFootnote,
  destructivePreviewAria,
  destructivePreviewLabel,
  destructiveReasonsAria,
  destructiveReasonsEmptyBody,
  destructiveReasonsEmptyTitle,
  destructiveRunLabel,
  destructiveRunTitle,
  destructiveSkipSessionLabel,
  destructiveSkipSessionTitle,
} from '@shared/destructiveSqlUi'
import {
  readOnlyBlockAllowedBody,
  readOnlyBlockAllowedTitle,
  readOnlyBlockBody,
  readOnlyBlockCopiedToast,
  readOnlyBlockCopyFailToast,
  readOnlyBlockCopyLabel,
  readOnlyBlockDisableConnectionLabel,
  readOnlyBlockDisableGlobalLabel,
  readOnlyBlockDismissLabel,
  readOnlyBlockFootnote,
  readOnlyBlockKicker,
  readOnlyBlockPreviewAria,
  readOnlyBlockPreviewLabel,
  readOnlyBlockTitle,
} from '@shared/readOnlySqlUi'
import { duplicateConnectionDialogHint } from '@shared/duplicateConnectionUi'
import {
  connectionTestButtonLabel,
  connectionTestButtonTitle,
  connectionTestFailBody,
  connectionTestFailTitle,
  connectionTestFailToast,
  connectionTestInvalidToast,
  connectionTestProbingStatus,
  connectionTestSuccessBody,
  connectionTestSuccessTitle,
  connectionTestSuccessToast,
} from '@shared/connectionTestUi'
import { EmptyState } from './EmptyState'

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
              {dirtyKeepLabel()}
            </button>
            <button type="button" className="btn btn-danger" onClick={() => onDecide('discard')}>
              {dirtyDiscardLabel()}
            </button>
          </div>
        </div>
      </div>
    )
  }
  if (ws.dialog.type === 'destructive') {
    return <DestructiveSqlDialog dialog={ws.dialog} pushToast={ws.pushToast} />
  }
  if (ws.dialog.type === 'readOnlyBlock') {
    return <ReadOnlyBlockDialog dialog={ws.dialog} />
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
  if (ws.dialog.type === 'dbVisibility') {
    return <DbVisibilityDialog connection={ws.dialog.connection} />
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
        <h2 id="import-title">导入连接</h2>
        <p className="dialog-copy">
          来自 <code className="inline-code">{path}</code>。密码仅含密封密文，不会写入明文。
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

  const draftFields = () => ({
    name,
    dialect,
    filePath,
    host,
    port,
  })

  const submit = async () => {
    setProbe('')
    const invalid = validateConnectionDraft(draftFields())
    if (invalid) {
      setError(invalid)
      return
    }
    setError('')
    try {
      await ws.saveConnection(buildInput())
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : '没有保存')
    }
  }

  const test = async () => {
    const invalid = validateConnectionDraft(draftFields())
    if (invalid) {
      setError(invalid)
      setProbe('')
      ws.pushToast('info', connectionTestInvalidToast())
      return
    }
    setProbing(true)
    setError('')
    setProbe('')
    try {
      const result = await ws.testConnection(buildInput())
      if (result.ok) {
        setProbe('ok')
        ws.pushToast('success', connectionTestSuccessToast(info.label))
      } else {
        const message = result.error ?? '连接失败'
        setError(message)
        ws.pushToast('error', connectionTestFailToast(message))
      }
    } catch (reason) {
      const message = reason instanceof Error ? reason.message : '连接失败'
      setError(message)
      ws.pushToast('error', connectionTestFailToast(message))
    } finally {
      setProbing(false)
    }
  }

  const useSampleInstead = () => {
    ws.closeDialog()
    void ws.restoreSample()
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
        {existing && /副本/.test(existing.name) ? (
          <p className="dialog-copy duplicate-conn-hint">{duplicateConnectionDialogHint()}</p>
        ) : null}
        <label className="field">
          <span>名称</span>
          <input
            value={name}
            onChange={(event) => setName(event.target.value)}
            autoFocus
            placeholder={connectionNamePlaceholder(dialect)}
            aria-invalid={Boolean(error && !name.trim())}
          />
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
          <p className="field-hint connection-dialect-help">{connectionDialectHelp(dialect)}</p>
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
              <span>{databaseLabel}{(dialect === 'mysql' || dialect === 'mariadb') ? '（可选）' : ''}</span>
              <input
                value={database}
                onChange={(event) => setDatabase(event.target.value)}
                spellCheck={false}
                placeholder={
                  dialect === 'mysql' || dialect === 'mariadb'
                    ? '可留空，对象树列出实例全部库'
                    : dialect === 'postgresql'
                      ? '默认 postgres，对象树可列其他库'
                      : undefined
                }
              />
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
        {probing ? (
          <p className="dialog-meta" role="status" aria-live="polite">
            {connectionTestProbingStatus()}
          </p>
        ) : null}
        {probe === 'ok' ? (
          <div className="connection-test-result is-ok">
            <EmptyState
              compact
              title={connectionTestSuccessTitle()}
              body={connectionTestSuccessBody(info.label)}
            />
          </div>
        ) : null}
        {error ? (
          <div className="connection-test-result is-bad">
            <EmptyState
              compact
              title={connectionTestFailTitle()}
              body={connectionTestFailBody(error)}
            />
          </div>
        ) : null}
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
          {!existing && (
            <button
              type="button"
              className="btn btn-ghost"
              title="关闭对话框并恢复内置示例业务库"
              onClick={useSampleInstead}
            >
              改用示例库
            </button>
          )}
          <button
            type="button"
            className="btn btn-ghost"
            disabled={probing}
            title={connectionTestButtonTitle()}
            aria-busy={probing}
            onClick={() => void test()}
          >
            {connectionTestButtonLabel(probing)}
          </button>
          <button type="button" className="btn btn-primary" onClick={() => void submit()}>
            保存
          </button>
        </div>
      </div>
    </div>
  )
}


function DbVisibilityDialog({ connection }: { connection: ConnectionPublic }) {
  const ws = useWorkspace()
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [allDbs, setAllDbs] = useState<string[]>([])
  const [checked, setChecked] = useState<Set<string>>(new Set())
  const [saving, setSaving] = useState(false)
  const [filterQuery, setFilterQuery] = useState('')
  const [reloadToken, setReloadToken] = useState(0)

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') ws.closeDialog()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [ws])

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      setLoading(true)
      setError('')
      try {
        const names = await getApi().connections.listDatabases(connection.id)
        if (cancelled) return
        setAllDbs(names)
        const whitelist = connection.visibleDatabases
        if (whitelist == null) {
          setChecked(new Set(names))
        } else {
          setChecked(new Set(whitelist.filter((n) => names.includes(n))))
        }
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : '无法列出数据库')
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [connection.id, connection.visibleDatabases, reloadToken])

  const filteredDbs = useMemo(
    () => filterDatabaseNames(allDbs, filterQuery),
    [allDbs, filterQuery],
  )

  const toggle = (name: string) => {
    setChecked((prev) => {
      const next = new Set(prev)
      if (next.has(name)) next.delete(name)
      else next.add(name)
      return next
    })
  }

  const selectAll = () => setChecked(new Set(allDbs))
  const selectNone = () => setChecked(new Set())
  const invertVisible = () =>
    setChecked((prev) => invertDatabaseChecked(filteredDbs, prev))

  const reload = () => {
    setFilterQuery('')
    setReloadToken((n) => n + 1)
  }

  const save = async () => {
    setSaving(true)
    try {
      const whitelist = whitelistForSave(allDbs, [...checked])
      await ws.saveVisibleDatabases(connection.id, whitelist)
    } catch (err) {
      setError(err instanceof Error ? err.message : '保存失败')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="overlay" role="presentation" onMouseDown={ws.closeDialog}>
      <div
        className="dialog dialog-wide"
        role="dialog"
        aria-modal="true"
        aria-labelledby="db-vis-title"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <h2 id="db-vis-title">显示的库 — {connection.name}</h2>
        <p className="dialog-copy">{dbVisibilityDialogCopy()}</p>
        {loading ? (
          <p className="dialog-meta">正在列出数据库…</p>
        ) : error ? (
          <EmptyState
            compact
            title="无法列出数据库"
            body={error}
            actions={
              <button type="button" className="btn btn-primary" onClick={reload}>
                重试
              </button>
            }
          />
        ) : allDbs.length === 0 ? (
          <EmptyState
            compact
            title="没有可显示的库"
            body={dbVisibilityEmptyBody()}
            actions={
              <button type="button" className="btn btn-ghost" onClick={reload}>
                重新加载
              </button>
            }
          />
        ) : (
          <>
            <label className="db-vis-filter">
              <span className="db-vis-filter-label">筛选</span>
              <input
                className="db-vis-filter-input"
                value={filterQuery}
                onChange={(event) => setFilterQuery(event.target.value)}
                placeholder="按库名过滤…"
                aria-label="按库名过滤"
              />
              {filterQuery.trim() && (
                <span className="dialog-meta">
                  {filteredDbs.length}/{allDbs.length}
                </span>
              )}
            </label>
            <div className="db-vis-toolbar">
              <button type="button" className="btn btn-ghost" onClick={selectAll}>
                全选
              </button>
              <button type="button" className="btn btn-ghost" onClick={selectNone}>
                全不选
              </button>
              <button
                type="button"
                className="btn btn-ghost"
                title={
                  filterQuery.trim()
                    ? '反选当前筛选结果中的库'
                    : '反选全部库'
                }
                disabled={filteredDbs.length === 0}
                onClick={invertVisible}
              >
                反选
              </button>
              <button
                type="button"
                className="btn btn-ghost"
                title={dbVisibilityCheckListTitle(Boolean(filterQuery.trim()))}
                disabled={filteredDbs.length === 0}
                onClick={() => setChecked((prev) => checkFilteredDatabases(filteredDbs, prev))}
              >
                {dbVisibilityCheckListLabel()}
              </button>
              <button
                type="button"
                className="btn btn-ghost"
                title={dbVisibilityOnlyListTitle(Boolean(filterQuery.trim()))}
                disabled={filteredDbs.length === 0}
                onClick={() => setChecked(keepOnlyFilteredDatabases(filteredDbs))}
              >
                {dbVisibilityOnlyListLabel()}
              </button>
              <span className="dialog-meta" role="status" aria-live="polite">
                {dbVisibilitySelectionSummary(checked.size, allDbs.length)}
              </span>
            </div>
            {checked.size === 0 ? (
              <p className="db-vis-warn" role="status">
                {dbVisibilityNoneCheckedWarning()}
              </p>
            ) : null}
            {filteredDbs.length === 0 ? (
              <EmptyState
                compact
                title="没有匹配的库"
                body="试试更短的关键字，或清除筛选后查看全部。"
                actions={
                  <button
                    type="button"
                    className="btn btn-ghost"
                    onClick={() => setFilterQuery('')}
                  >
                    清除筛选
                  </button>
                }
              />
            ) : (
              <div className="db-vis-list" role="group" aria-label={dbVisibilityListAria()}>
                {filteredDbs.map((name) => (
                  <label key={name} className="checkline db-vis-item">
                    <input
                      type="checkbox"
                      checked={checked.has(name)}
                      aria-label={dbVisibilityCheckboxAria(name, checked.has(name))}
                      onChange={() => toggle(name)}
                    />
                    <span>{name}</span>
                  </label>
                ))}
              </div>
            )}
          </>
        )}
        <div className="dialog-actions">
          <button type="button" className="btn btn-ghost" onClick={ws.closeDialog}>
            取消
          </button>
          <button
            type="button"
            className="btn btn-primary"
            disabled={loading || !!error || saving || allDbs.length === 0}
            onClick={() => void save()}
          >
            {saving ? '保存中…' : '保存'}
          </button>
        </div>
      </div>
    </div>
  )
}

function DestructiveSqlDialog({
  dialog,
  pushToast,
}: {
  dialog: {
    reasons: string[]
    preview: string
    onDecide: (decision: 'run' | 'skip-session' | 'cancel') => void
  }
  pushToast: (tone: 'info' | 'success' | 'error', text: string) => void
}) {
  const { reasons, preview, onDecide } = dialog
  const cancelRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    cancelRef.current?.focus()
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault()
        onDecide('cancel')
      }
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [onDecide])

  const copyPreview = () => {
    const text = preview.trim()
    if (!text) return
    void navigator.clipboard.writeText(text).then(
      () => pushToast('success', destructiveCopyPreviewToast()),
      () => pushToast('error', destructiveCopyPreviewFailToast()),
    )
  }

  return (
    <div className="overlay" role="presentation" onMouseDown={() => onDecide('cancel')}>
      <div
        className="dialog dialog-danger"
        role="dialog"
        aria-modal="true"
        aria-labelledby="destructive-title"
        aria-describedby="destructive-copy"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <p className="danger-kicker">高风险操作</p>
        <h2 id="destructive-title">{destructiveDialogTitle(reasons.length)}</h2>
        <p id="destructive-copy" className="dialog-copy">
          {destructiveDialogBody()}
        </p>
        {reasons.length === 0 ? (
          <EmptyState
            compact
            title={destructiveReasonsEmptyTitle()}
            body={destructiveReasonsEmptyBody()}
          />
        ) : (
          <ul className="danger-list" aria-label={destructiveReasonsAria()}>
            {reasons.map((reason) => (
              <li key={reason}>{reason}</li>
            ))}
          </ul>
        )}
        <div className="danger-preview-head">
          <span className="danger-preview-label">{destructivePreviewLabel()}</span>
          <button
            type="button"
            className="btn btn-ghost tiny-btn"
            disabled={!preview.trim()}
            onClick={copyPreview}
          >
            {destructiveCopyPreviewLabel()}
          </button>
        </div>
        <pre className="danger-preview" aria-label={destructivePreviewAria()} tabIndex={0}>
          {preview}
        </pre>
        <p className="danger-footnote">{destructiveFootnote()}</p>
        <div className="dialog-actions dialog-actions-wrap">
          <button
            ref={cancelRef}
            type="button"
            className="btn btn-ghost"
            onClick={() => onDecide('cancel')}
          >
            {destructiveCancelLabel()}
          </button>
          <button
            type="button"
            className="btn btn-ghost"
            title={destructiveSkipSessionTitle()}
            onClick={() => onDecide('skip-session')}
          >
            {destructiveSkipSessionLabel()}
          </button>
          <button
            type="button"
            className="btn btn-danger"
            title={destructiveRunTitle()}
            onClick={() => onDecide('run')}
          >
            {destructiveRunLabel()}
          </button>
        </div>
      </div>
    </div>
  )
}

function ReadOnlyBlockDialog({
  dialog,
}: {
  dialog: {
    verb: string | null
    statement: string
    reason: string
    source: 'global' | 'connection' | 'both'
  }
}) {
  const ws = useWorkspace()
  const cancelRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    cancelRef.current?.focus()
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault()
        ws.closeDialog()
      }
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [ws])

  const copyStatement = () => {
    const text = dialog.statement.trim()
    if (!text) return
    void navigator.clipboard.writeText(text).then(
      () => ws.pushToast('success', readOnlyBlockCopiedToast()),
      () => ws.pushToast('error', readOnlyBlockCopyFailToast()),
    )
  }

  return (
    <div className="overlay" role="presentation" onMouseDown={ws.closeDialog}>
      <div
        className="dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="readonly-block-title"
        aria-describedby="readonly-block-copy"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <p className="readonly-block-kicker">{readOnlyBlockKicker()}</p>
        <h2 id="readonly-block-title">{readOnlyBlockTitle(dialog.verb)}</h2>
        <p id="readonly-block-copy" className="dialog-copy">
          {readOnlyBlockBody(dialog.source)}
        </p>
        <p className="dialog-meta">{dialog.reason}</p>
        <EmptyState
          compact
          title={readOnlyBlockAllowedTitle()}
          body={readOnlyBlockAllowedBody()}
        />
        {dialog.statement.trim() ? (
          <>
            <div className="readonly-block-preview-head">
              <span className="readonly-block-preview-label">{readOnlyBlockPreviewLabel()}</span>
              <button type="button" className="btn btn-ghost tiny-btn" onClick={copyStatement}>
                {readOnlyBlockCopyLabel()}
              </button>
            </div>
            <pre className="readonly-block-preview" aria-label={readOnlyBlockPreviewAria()} tabIndex={0}>
              {dialog.statement}
            </pre>
          </>
        ) : null}
        <p className="readonly-block-footnote">{readOnlyBlockFootnote()}</p>
        <div className="dialog-actions dialog-actions-wrap">
          <button ref={cancelRef} type="button" className="btn btn-primary" onClick={ws.closeDialog}>
            {readOnlyBlockDismissLabel()}
          </button>
          {(dialog.source === 'connection' || dialog.source === 'both') && (
            <button
              type="button"
              className="btn btn-ghost"
              onClick={() => {
                void ws.toggleConnectionReadOnly().then(() => ws.closeDialog())
              }}
            >
              {readOnlyBlockDisableConnectionLabel()}
            </button>
          )}
          {(dialog.source === 'global' || dialog.source === 'both') && (
            <button
              type="button"
              className="btn btn-ghost"
              onClick={() => {
                void ws.setGlobalReadOnly(false).then(() => ws.closeDialog())
              }}
            >
              {readOnlyBlockDisableGlobalLabel()}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

