import { useEffect, useMemo, useState } from 'react'
import type { RedisKeyInfo, RedisValueView } from '@shared/types'
import {
  REDIS_SCAN_PRESETS,
  formatRedisValueClipboard,
  redisCopyKeyLabel,
  redisCopyValueLabel,
  redisEmptyValueBody,
  redisEmptyValueTitle,
  redisKeyCopiedToast,
  redisKeysHeading,
  redisKicker,
  redisNoConnectionBody,
  redisNoConnectionTitle,
  redisNoKeysBody,
  redisNoKeysTitle,
  redisPickKeyBody,
  redisPickKeyTitle,
  redisScanHint,
  redisScanLabel,
  redisTtlLabel,
  redisTypeLabel,
  redisValueCopiedToast,
  redisValueHeading,
  redisValueIsEmpty,
  redisValueMeta,
} from '@shared/redisBrowserUi'
import { getApi } from '../bridge'
import { useWorkspace } from '../state/workspace'
import { EmptyState } from './EmptyState'

export function RedisPane() {
  const ws = useWorkspace()
  const connection = ws.activeConnection
  const [pattern, setPattern] = useState('*')
  const [keys, setKeys] = useState<RedisKeyInfo[]>([])
  const [selected, setSelected] = useState<string | null>(null)
  const [value, setValue] = useState<RedisValueView | null>(null)
  const [loading, setLoading] = useState(false)
  const [reading, setReading] = useState(false)
  const [error, setError] = useState('')

  const selectedInfo = useMemo(
    () => keys.find((row) => row.key === selected) ?? null,
    [keys, selected],
  )

  const refresh = async (nextPattern = pattern) => {
    if (!connection) return
    setLoading(true)
    setError('')
    try {
      const rows = await getApi().redis.scan({
        connectionId: connection.id,
        pattern: nextPattern,
        count: 120,
      })
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
    setReading(true)
    try {
      const next = await getApi().redis.get({ connectionId: connection.id, key })
      setValue(next)
    } catch (reason) {
      setValue(null)
      setError(reason instanceof Error ? reason.message : '读取失败')
    } finally {
      setReading(false)
    }
  }

  const copyKey = () => {
    if (!selected) return
    void navigator.clipboard.writeText(selected).then(
      () => ws.pushToast('success', redisKeyCopiedToast()),
      () => ws.pushToast('error', '复制失败'),
    )
  }

  const copyValue = () => {
    if (!value) return
    void navigator.clipboard.writeText(formatRedisValueClipboard(value)).then(
      () => ws.pushToast('success', redisValueCopiedToast()),
      () => ws.pushToast('error', '复制失败'),
    )
  }

  if (!connection) {
    return (
      <section className="redis-pane" aria-label="Redis 浏览器">
        <EmptyState
          kicker={redisKicker()}
          title={redisNoConnectionTitle()}
          body={redisNoConnectionBody()}
        />
      </section>
    )
  }

  return (
    <section className="redis-pane" aria-label="Redis 浏览器">
      <header className="redis-head">
        <div>
          <p className="ai-kicker">{redisKicker()}</p>
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
            aria-label={redisScanHint()}
            spellCheck={false}
          />
          <button type="submit" className="btn btn-primary" disabled={loading}>
            {redisScanLabel(loading)}
          </button>
        </form>
      </header>
      <div className="redis-presets" role="group" aria-label="常用匹配">
        {REDIS_SCAN_PRESETS.map((preset) => (
          <button
            key={preset}
            type="button"
            className={pattern === preset ? 'redis-preset is-active' : 'redis-preset'}
            aria-pressed={pattern === preset}
            onClick={() => {
              setPattern(preset)
              void refresh(preset)
            }}
          >
            {preset}
          </button>
        ))}
      </div>
      {error ? (
        <article className="card card-error" role="alert">
          <p className="card-body">{error}</p>
        </article>
      ) : null}
      <div className="redis-grid">
        <div className="card redis-keys">
          <p className="card-kicker">{redisKeysHeading(keys.length)}</p>
          <div className="redis-key-list">
            {keys.length === 0 ? (
              <EmptyState
                compact
                kicker={redisKicker()}
                title={redisNoKeysTitle()}
                body={redisNoKeysBody(pattern)}
                actions={
                  <button
                    type="button"
                    className="btn btn-ghost"
                    onClick={() => {
                      setPattern('*')
                      void refresh('*')
                    }}
                  >
                    扫描 *
                  </button>
                }
              />
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
                    <span className="badge badge-redis">{redisTypeLabel(item.type)}</span>
                    {redisTtlLabel(item.ttl)}
                  </span>
                </button>
              ))
            )}
          </div>
        </div>
        <div className="card redis-value">
          <div className="redis-value-head">
            <p className="card-kicker">{redisValueHeading()}</p>
            {selected ? (
              <div className="redis-value-actions">
                <button type="button" className="btn btn-ghost tiny-btn" onClick={copyKey}>
                  {redisCopyKeyLabel()}
                </button>
                <button
                  type="button"
                  className="btn btn-ghost tiny-btn"
                  disabled={!value}
                  onClick={copyValue}
                >
                  {redisCopyValueLabel()}
                </button>
              </div>
            ) : null}
          </div>
          {!selected ? (
            <EmptyState
              compact
              kicker={redisKicker()}
              title={redisPickKeyTitle()}
              body={redisPickKeyBody()}
            />
          ) : reading ? (
            <p className="card-body dim">正在读取…</p>
          ) : !value ? (
            <p className="card-body dim">未能读取该键</p>
          ) : (
            <RedisValue value={value} selected={selected} meta={redisValueMeta(selectedInfo, value)} />
          )}
        </div>
      </div>
    </section>
  )
}

function RedisValue({
  value,
  selected,
  meta,
}: {
  value: RedisValueView
  selected: string
  meta: string
}) {
  if (redisValueIsEmpty(value)) {
    return (
      <div className="redis-value-body">
        <h3>{selected}</h3>
        {meta ? <p className="redis-value-meta">{meta}</p> : null}
        <EmptyState
          compact
          kicker={redisKicker()}
          title={redisEmptyValueTitle(value.kind === 'unsupported' ? value.redisType : value.kind)}
          body={redisEmptyValueBody()}
        />
      </div>
    )
  }

  if (value.kind === 'string') {
    return (
      <div className="redis-value-body">
        <h3>{selected}</h3>
        {meta ? <p className="redis-value-meta">{meta}</p> : null}
        <pre className="redis-pre">{value.value || '（空字符串）'}</pre>
      </div>
    )
  }
  if (value.kind === 'hash') {
    return (
      <div className="redis-value-body">
        <h3>{selected}</h3>
        {meta ? <p className="redis-value-meta">{meta}</p> : null}
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
        {meta ? <p className="redis-value-meta">{meta}</p> : null}
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
        {meta ? <p className="redis-value-meta">{meta}</p> : null}
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
        {meta ? <p className="redis-value-meta">{meta}</p> : null}
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
      {meta ? <p className="redis-value-meta">{meta}</p> : null}
      <p className="card-body">{value.note}</p>
    </div>
  )
}
