import { useEffect, useRef, useState } from 'react'
import { parseBlocks, extractSql } from '@shared/sql'
import { ASSISTANT_PROMPTS } from '@shared/session'
import { ALTER_PROMPTS, CREATE_PROMPTS } from '@shared/ddlDraft'
import type { AiIntent } from '@shared/types'
import { IconSend, IconSpark } from './icons'
import { useWorkspace } from '../state/workspace'

const INTENT_LABEL: Record<AiIntent, string> = {
  query: '查询',
  create: '建表',
  alter: '改表',
}

export function AiPane() {
  const ws = useWorkspace()
  const [draft, setDraft] = useState('')
  const [settingsOpen, setSettingsOpen] = useState(false)
  const scroller = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const el = scroller.current
    if (!el) return
    el.scrollTop = el.scrollHeight
  }, [ws.aiTurns, ws.aiStreaming])

  const prompts =
    ws.aiIntent === 'create' ? CREATE_PROMPTS : ws.aiIntent === 'alter' ? ALTER_PROMPTS : ASSISTANT_PROMPTS

  const submit = () => {
    const text = draft.trim()
    if (!text) return
    setDraft('')
    void ws.sendAi(text)
  }

  return (
    <aside className="ai" aria-label="助手">
      <div className="ai-head">
        <div>
          <p className="ai-kicker">助手</p>
          <h2>{ws.aiIntent === 'create' ? 'AI 建表' : ws.aiIntent === 'alter' ? 'AI 改表' : '自然语言转 SQL'}</h2>
        </div>
        <button
          type="button"
          className={ws.settings?.hasKey ? 'pill is-ready' : 'pill'}
          onClick={() => setSettingsOpen((open) => !open)}
          aria-expanded={settingsOpen}
        >
          {ws.settings?.hasKey ? '模型已就绪' : '本地预览'}
        </button>
      </div>

      <div className="intent-tabs" role="tablist" aria-label="助手模式">
        {(['query', 'create', 'alter'] as AiIntent[]).map((intent) => (
          <button
            key={intent}
            type="button"
            role="tab"
            aria-selected={ws.aiIntent === intent}
            className={ws.aiIntent === intent ? 'intent is-active' : 'intent'}
            onClick={() => ws.setAiIntent(intent)}
          >
            {INTENT_LABEL[intent]}
          </button>
        ))}
      </div>

      {ws.aiIntent === 'create' && (
        <label className="ai-select">
          <span>参考表风格</span>
          <select value={ws.referenceTable} onChange={(event) => ws.setReferenceTable(event.target.value)}>
            <option value="">自动推断</option>
            {ws.tableNames.map((name) => (
              <option key={name} value={name}>
                {name}
              </option>
            ))}
          </select>
        </label>
      )}
      {ws.aiIntent === 'alter' && (
        <label className="ai-select">
          <span>目标表</span>
          <select value={ws.targetTable} onChange={(event) => ws.setTargetTable(event.target.value)}>
            <option value="">从描述推断</option>
            {ws.tableNames.map((name) => (
              <option key={name} value={name}>
                {name}
              </option>
            ))}
          </select>
        </label>
      )}

      {settingsOpen && <SettingsCard onClose={() => setSettingsOpen(false)} />}
      <div className="ai-scroll" ref={scroller}>
        {ws.aiTurns.length === 0 && (
          <article className="card">
            <p className="card-kicker">从当前库开始</p>
            <h3>
              {ws.aiIntent === 'create'
                ? '描述要建的表'
                : ws.aiIntent === 'alter'
                  ? '描述要改的字段'
                  : '用一句话描述要看的数据'}
            </h3>
            <p className="card-body">
              {ws.aiIntent === 'create'
                ? '助手会参考现有表风格起草 CREATE TABLE，确认后可一键执行。'
                : ws.aiIntent === 'alter'
                  ? '助手先给出 ALTER TABLE 预览，确认后再执行；失败会尝试修复。'
                  : '助手会先检索相关表、读取字段，再起草 SQL。'}
            </p>
            <div className="chips">
              {prompts.map((prompt) => (
                <button key={prompt} type="button" className="chip" onClick={() => void ws.sendAi(prompt)}>
                  {prompt}
                </button>
              ))}
            </div>
          </article>
        )}
        {ws.aiTurns.map((turn) =>
          turn.role === 'user' ? (
            <article key={turn.id} className="card card-user">
              <p className="card-kicker">你</p>
              <p className="card-body">{turn.content}</p>
            </article>
          ) : (
            <article key={turn.id} className={turn.id === ws.aiTurns.at(-1)?.id && ws.aiStreaming ? 'card is-streaming' : 'card'}>
              <p className="card-kicker">
                <IconSpark />
                {turn.mode === 'model' ? '模型' : '本地预览'}
                {turn.id === ws.aiTurns.at(-1)?.id && ws.aiStreaming ? ' · 进行中' : ''}
              </p>
              {turn.steps && turn.steps.length > 0 && (
                <ul className="ai-steps">
                  {turn.steps.map((step, index) => (
                    <li key={`${turn.id}:step:${index}`}>
                      <strong>{step.step}</strong>
                      {step.detail ? <span>{step.detail}</span> : null}
                    </li>
                  ))}
                </ul>
              )}
              <AssistantBody content={turn.content} streaming={turn.id === ws.aiTurns.at(-1)?.id && ws.aiStreaming} />
            </article>
          ),
        )}
      </div>
      <form
        className="composer"
        onSubmit={(event) => {
          event.preventDefault()
          submit()
        }}
      >
        <textarea
          value={draft}
          rows={3}
          placeholder={
            ws.aiIntent === 'create' ? '描述新表…' : ws.aiIntent === 'alter' ? '描述改表…' : '描述想看的数据，Enter 发送'
          }
          aria-label="向助手描述需求"
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter' && !event.shiftKey) {
              event.preventDefault()
              submit()
            }
          }}
        />
        {ws.aiStreaming ? (
          <button type="button" className="btn btn-ghost" onClick={ws.cancelAi}>
            停止
          </button>
        ) : (
          <button type="submit" className="btn btn-primary send-btn" disabled={!draft.trim()} aria-label="发送">
            <IconSend />
          </button>
        )}
      </form>
    </aside>
  )
}

function AssistantBody({ content, streaming }: { content: string; streaming: boolean }) {
  const ws = useWorkspace()
  if (!content && streaming) return <p className="card-body dim">正在处理…</p>
  const blocks = parseBlocks(content)
  if (blocks.length === 0) return content ? <p className="card-body">{content}</p> : null
  return (
    <div className="card-blocks">
      {blocks.map((block, index) =>
        block.type === 'text' ? (
          <p key={index} className="card-body">
            {block.text}
          </p>
        ) : (
          <div key={index} className="sql-block">
            <div className="sql-block-bar">
              <span>SQL</span>
              <div className="sql-block-actions">
                {block.closed && (
                  <button type="button" onClick={() => ws.applySql(block.text)}>
                    写入编辑器
                  </button>
                )}
                {block.closed && (
                  <button
                    type="button"
                    className="is-primary"
                    disabled={ws.running}
                    onClick={() => void ws.executeAiSql(block.text)}
                  >
                    {ws.aiIntent === 'alter' ? '确认执行' : '一键执行'}
                  </button>
                )}
              </div>
            </div>
            <pre>
              {block.text}
              {!block.closed && <span className="caret" />}
            </pre>
          </div>
        ),
      )}
      {extractSql(content) && !streaming && ws.aiIntent !== 'query' && (
        <p className="card-footnote">DDL 会直接改库结构，执行前请再看一眼。</p>
      )}
    </div>
  )
}

function SettingsCard({ onClose }: { onClose: () => void }) {
  const ws = useWorkspace()
  const [baseUrl, setBaseUrl] = useState(ws.settings?.baseUrl ?? '')
  const [model, setModel] = useState(ws.settings?.model ?? '')
  const [apiKey, setApiKey] = useState('')
  const [error, setError] = useState('')

  return (
    <form
      className="card settings-card"
      onSubmit={(event) => {
        event.preventDefault()
        void ws
          .saveSettings({ baseUrl, model, apiKey: apiKey || undefined })
          .then(() => {
            setApiKey('')
            onClose()
          })
          .catch((reason: unknown) => setError(reason instanceof Error ? reason.message : '没有保存'))
      }}
    >
      <p className="card-kicker">OpenAI 兼容接口</p>
      <label className="field">
        <span>接口地址</span>
        <input value={baseUrl} onChange={(event) => setBaseUrl(event.target.value)} spellCheck={false} />
      </label>
      <label className="field">
        <span>模型</span>
        <input value={model} onChange={(event) => setModel(event.target.value)} spellCheck={false} />
      </label>
      <label className="field">
        <span>密钥</span>
        <input
          type="password"
          value={apiKey}
          placeholder={ws.settings?.hasKey ? '已保存，留空则不修改' : '不会以明文写入磁盘'}
          onChange={(event) => setApiKey(event.target.value)}
          autoComplete="off"
        />
      </label>
      <p className="field-hint">
        {ws.meta?.encryption === 'os' ? '密钥用系统密钥环加密后保存在本机。' : '当前系统没有可用的密钥环，密钥不会写入磁盘。'}
      </p>
      {error && <p className="field-error">{error}</p>}
      <div className="dialog-actions">
        <button type="button" className="btn btn-ghost" onClick={onClose}>
          关闭
        </button>
        <button type="submit" className="btn btn-primary">
          保存
        </button>
      </div>
    </form>
  )
}
