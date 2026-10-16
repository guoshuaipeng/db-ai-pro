import { useEffect, useState } from 'react'
import type { RedisKeyInfo, RedisValueView } from '@shared/types'
import { getApi } from '../bridge'
import { useWorkspace } from '../state/workspace'

export function RedisPane() {
  const ws = useWorkspace()
  const connection = ws.activeConnection
  const [pattern, setPattern] = useState('*')
  const [keys, setKeys] = useState<RedisKeyInfo[]>([])
  const [selected, setSelected] = useState<string | null>(null)
  const [value, setValue] = useState<RedisValueView | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const refresh = async (nextPattern = pattern) => {
    if (!connection) return
    setLoading(true)
    setError('')
    try {
      const rows = await getApi().redis.scan({ connectionId: connection.id, pattern: nextPattern, count: 120 })
      setKeys(rows)
      if (selected && !rows.some((row) => row.key === selected)) {
        setSelected(null)
        setValue(null)
      }
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'SCAN 失败')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void refresh('*')
    setPattern('*')
    setSelected(null)
    setValue(null)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [connection?.id])

  const openKey = async (key: string) => {
    if (!connection) return
    setSelected(key)
    setError('')
    try {
      const next = await getApi().redis.get({ connectionId: connection.id, key })
      setValue(next)
    } catch (reason) {
      setValue(null)
      setError(reason instanceof Error ? reason.message : '读取失败')
    }
  }

  if (!connection) {
    return (
      <section className="redis-pane">
        <article className="card">
          <p className="card-kicker">Redis</p>
          <h3>先选择一个 Redis 连接</h3>
        </article>
      </section>
    )
  }

  return (
    <section className="redis-pane" aria-label="Redis 浏览器">
      <header className="redis-head">
        <div>
          <p className="ai-kicker">Redis</p>
          <h2>{connection.name}</h2>
        </div>
        <form
          className="redis-scan"
          onSubmit={(event) => {
            event.preventDefault()
            void refresh(pattern)
          }}
        >
          <input
            value={pattern}
            onChange={(event) => setPattern(event.target.value)}
            placeholder="SCAN 匹配，例如 user:*"
            aria-label="键匹配模式"
            spellCheck={false}
          />
          <button type="submit" className="btn btn-primary" disabled={loading}>
            {loading ? '扫描中…' : 'SCAN'}
          </button>
        </form>
      </header>
      {error && (
        <article className="card card-error" role="alert">
          <p className="card-body">{error}</p>
        </article>
      )}
      <div className="redis-grid">
        <div className="card redis-keys">
          <p className="card-kicker">键 · {keys.length}</p>
          <div className="redis-key-list">
            {keys.length === 0 ? (
              <p className="card-body dim">没有匹配的键</p>
            ) : (
              keys.map((item) => (
                <button
                  key={item.key}
                  type="button"
                  className={selected === item.key ? 'redis-key is-selected' : 'redis-key'}
                  onClick={() => void openKey(item.key)}
                >
                  <span className="redis-key-name">{item.key}</span>
                  <span className="redis-key-meta">
                    <span className="badge badge-redis">{item.type}</span>
                    {item.ttl >= 0 ? `TTL ${item.ttl}s` : '持久'}
                  </span>
                </button>
              ))
            )}
          </div>
        </div>
        <div className="card redis-value">
          <p className="card-kicker">值</p>
          {!selected ? (
            <p className="card-body dim">从左侧选择一个键</p>
          ) : !value ? (
            <p className="card-body dim">正在读取…</p>
          ) : (
            <RedisValue value={value} selected={selected} />
          )}
        </div>
      </div>
    </section>
  )
}

function RedisValue({ value, selected }: { value: RedisValueView; selected: string }) {
  if (value.kind === 'string') {
    return (
      <div className="redis-value-body">
        <h3>{selected}</h3>
        <pre className="redis-pre">{value.value || '（空字符串）'}</pre>
      </div>
    )
  }
  if (value.kind === 'hash') {
    return (
      <div className="redis-value-body">
        <h3>{selected}</h3>
        <table className="redis-table">
          <thead>
            <tr>
              <th>字段</th>
              <th>值</th>
            </tr>
          </thead>
          <tbody>
            {value.fields.map((field) => (
              <tr key={field.field}>
                <td>{field.field}</td>
                <td>{field.value}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    )
  }
  if (value.kind === 'list') {
    return (
      <div className="redis-value-body">
        <h3>{selected}</h3>
        <ol className="redis-list">
          {value.items.map((item, index) => (
            <li key={`${index}:${item}`}>{item}</li>
          ))}
        </ol>
      </div>
    )
  }
  if (value.kind === 'zset') {
    return (
      <div className="redis-value-body">
        <h3>{selected}</h3>
        <table className="redis-table">
          <thead>
            <tr>
              <th>成员</th>
              <th>分数</th>
            </tr>
          </thead>
          <tbody>
            {value.items.map((item) => (
              <tr key={item.member}>
                <td>{item.member}</td>
                <td>{item.score}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    )
  }
  if (value.kind === 'set') {
    return (
      <div className="redis-value-body">
        <h3>{selected}</h3>
        <ul className="redis-list">
          {value.members.map((member) => (
            <li key={member}>{member}</li>
          ))}
        </ul>
      </div>
    )
  }
  return (
    <div className="redis-value-body">
      <h3>{selected}</h3>
      <p className="card-body">{value.note}</p>
    </div>
  )
}

