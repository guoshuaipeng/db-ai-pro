import { useEffect, useRef, useState } from 'react'
import { parseBlocks, extractSql } from '@shared/sql'
import {
  aiStepsSummary,
  joinSqlBlocksForCopy,
  shouldCollapseAiSteps,
} from '@shared/aiCardActions'
import { ASSISTANT_PROMPTS } from '@shared/session'
import { ALTER_PROMPTS, CREATE_PROMPTS } from '@shared/ddlDraft'
import type { AiIntent } from '@shared/types'
import { IconSend, IconSpark, IconStop } from './icons'
import { EmptyState } from './EmptyState'
import { emitDataai, onDataai } from '../appEvents'
import { aiComposerPlaceholder } from '@shared/aiComposer'
import { useWorkspace } from '../state/workspace'

const INTENT_LABEL: Record<AiIntent, string> = {
  query: '查询',
  create: '建表',
  alter: '改表',
}

async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text)
    return true
  } catch {
    return false
  }
}

export function AiPane() {
  const ws = useWorkspace()
  const [draft, setDraft] = useState('')
  const scroller = useRef<HTMLDivElement>(null)
  const composerRef = useRef<HTMLTextAreaElement>(null)
  const [stepsOpen, setStepsOpen] = useState<Record<string, boolean>>({})

  useEffect(() => {
    const el = scroller.current
    if (!el) return
    el.scrollTop = el.scrollHeight
  }, [ws.aiTurns, ws.aiStreaming])

  useEffect(() => {
    const id = window.setTimeout(() => composerRef.current?.focus(), 40)
    return () => window.clearTimeout(id)
  }, [])

  useEffect(() => {
    return onDataai('dataai:focus-ai-composer', () => {
      composerRef.current?.focus()
    })
  }, [])

  const prompts =
    ws.aiIntent === 'create' ? CREATE_PROMPTS : ws.aiIntent === 'alter' ? ALTER_PROMPTS : ASSISTANT_PROMPTS

  const submit = () => {
    const text = draft.trim()
    if (!text) return
    setDraft('')
    void ws.sendAi(text)
  }

  const notifyCopy = (ok: boolean, label: string) => {
    if (ok) ws.pushToast('success', `已复制${label}`)
    else ws.pushToast('error', '复制失败，请检查剪贴板权限')
  }

  return (
    <aside className="ai" aria-label="助手">
      <div className="ai-head">
        <div>
          <p className="ai-kicker">助手</p>
          <h2>{ws.aiIntent === 'create' ? 'AI 建表' : ws.aiIntent === 'alter' ? 'AI 改表' : '自然语言转 SQL'}</h2>
        </div>
        <div className="ai-head-actions">
          {ws.aiTurns.length > 0 && (
            <button type="button" className="tiny-btn btn btn-ghost" onClick={ws.clearAiMemory} title="清空会话记忆">
              清空
            </button>
          )}
          <button
            type="button"
            className={ws.settings?.hasKey ? 'pill is-ready' : 'pill'}
            onClick={() => emitDataai('dataai:open-ai-settings')}
          >
            {ws.settings?.hasKey ? '模型已就绪' : '本地预览'}
          </button>
        </div>
      </div>

      <div className="intent-tabs" role="tablist" aria-label="助手模式">
        {(['query', 'create', 'alter'] as AiIntent[]).map((intent) => (
          <button
            key={intent}
            type="button"
            role="tab"
            aria-selected={ws.aiIntent === intent}
            className={ws.aiIntent === intent ? 'intent is-active' : 'intent'}
            disabled={ws.aiStreaming}
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

      <div className="ai-scroll" ref={scroller}>
        {ws.aiTurns.length === 0 && (
          <EmptyState
            kicker="从当前库开始"
            title={
              ws.aiIntent === 'create'
                ? '描述要建的表'
                : ws.aiIntent === 'alter'
                  ? '描述要改的字段'
                  : '用一句话描述要看的数据'
            }
            body={
              ws.aiIntent === 'create'
                ? '助手会参考现有表风格起草 CREATE TABLE，确认后可一键执行。'
                : ws.aiIntent === 'alter'
                  ? '助手先给出 ALTER TABLE 预览，确认后再执行；失败会尝试修复。'
                  : '助手会先检索相关表、读取字段，再起草 SQL。未配置密钥时使用本地预览。'
            }
            icon={<IconSpark />}
            actions={
              <div className="chips">
                {prompts.map((prompt) => (
                  <button key={prompt} type="button" className="chip" disabled={ws.aiStreaming} onClick={() => void ws.sendAi(prompt)}>
                    {prompt}
                  </button>
                ))}
              </div>
            }
          />
        )}
        {ws.aiTurns.map((turn) => {
          const streaming = turn.id === ws.aiTurns.at(-1)?.id && ws.aiStreaming
          if (turn.role === 'user') {
            return (
              <article key={turn.id} className="card card-user">
                <div className="card-head">
                  <p className="card-kicker">你</p>
                  <div className="card-actions">
                    <button
                      type="button"
                      className="tiny-btn btn btn-ghost"
                      title="复制"
                      onClick={() => void copyText(turn.content).then((ok) => notifyCopy(ok, '消息'))}
                    >
                      复制
                    </button>
                  </div>
                </div>
                <p className="card-body">{turn.content}</p>
              </article>
            )
          }

          const sqlCopy = joinSqlBlocksForCopy(turn.content)
          const stepCount = turn.steps?.length ?? 0
          const collapseDefault = shouldCollapseAiSteps(stepCount, streaming)
          const open = stepsOpen[turn.id] ?? !collapseDefault

          return (
            <article
              key={turn.id}
              className={[
                'card',
                'card-assistant',
                streaming ? 'is-streaming' : '',
                turn.status === 'cancelled' ? 'is-cancelled' : '',
              ]
                .filter(Boolean)
                .join(' ')}
            >
              <div className="card-head">
                <p className="card-kicker">
                  <IconSpark />
                  {turn.mode === 'model' ? '模型' : '本地预览'}
                  {streaming ? ' · 进行中' : ''}
                  {turn.status === 'cancelled' ? ' · 已停止' : ''}
                </p>
                <div className="card-actions">
                  {streaming && (
                    <button type="button" className="tiny-btn btn btn-danger ai-stop-inline" onClick={ws.cancelAi}>
                      <IconStop />
                      停止
                    </button>
                  )}
                  {!streaming && turn.content.trim() && (
                    <button
                      type="button"
                      className="tiny-btn btn btn-ghost"
                      title="复制全文"
                      onClick={() => void copyText(turn.content).then((ok) => notifyCopy(ok, '全文'))}
                    >
                      复制全文
                    </button>
                  )}
                  {!streaming && sqlCopy && (
                    <button
                      type="button"
                      className="tiny-btn btn btn-ghost"
                      title="复制全部 SQL"
                      onClick={() => void copyText(sqlCopy).then((ok) => notifyCopy(ok, ' SQL'))}
                    >
                      复制 SQL
                    </button>
                  )}
                </div>
              </div>
              {stepCount > 0 && (
                <div className="ai-steps-wrap">
                  <button
                    type="button"
                    className="ai-steps-toggle"
                    aria-expanded={open}
                    onClick={() => setStepsOpen((current) => ({ ...current, [turn.id]: !open }))}
                  >
                    <span className={open ? 'ai-steps-chevron is-open' : 'ai-steps-chevron'} aria-hidden="true">
                      ▸
                    </span>
                    {aiStepsSummary(stepCount)}
                    {collapseDefault && !open ? ' · 已折叠' : ''}
                  </button>
                  {open && (
                    <ul className="ai-steps">
                      {turn.steps!.map((step, index) => {
                        const active = streaming && index === turn.steps!.length - 1
                        return (
                          <li key={`${turn.id}:step:${index}`} className={active ? 'is-active' : undefined}>
                            <strong>{step.step}</strong>
                            {step.detail ? <span>{step.detail}</span> : null}
                          </li>
                        )
                      })}
                    </ul>
                  )}
                </div>
              )}
              <AssistantBody
                content={turn.content}
                streaming={streaming}
                onCopied={(label) => notifyCopy(true, label)}
                onCopyFail={() => notifyCopy(false, '')}
              />
            </article>
          )
        })}
      </div>
      <form
        className="composer"
        onSubmit={(event) => {
          event.preventDefault()
          submit()
        }}
      >
        <textarea
          ref={composerRef}
          value={draft}
          rows={3}
          placeholder={aiComposerPlaceholder(ws.aiIntent)}
          aria-label="向助手描述需求"
          title="Enter 发送 · Shift+Enter 换行"
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter' && !event.shiftKey) {
              event.preventDefault()
              submit()
            }
          }}
        />
        {ws.aiStreaming ? (
          <button type="button" className="btn btn-danger send-btn" onClick={ws.cancelAi} aria-label="停止生成">
            <IconStop />
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

function AssistantBody({
  content,
  streaming,
  onCopied,
  onCopyFail,
}: {
  content: string
  streaming: boolean
  onCopied: (label: string) => void
  onCopyFail: () => void
}) {
  const ws = useWorkspace()
  if (!content && streaming) return <p className="card-body dim is-waiting">正在检索 / 生成…</p>
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
                  <button
                    type="button"
                    onClick={() =>
                      void copyText(block.text).then((ok) => (ok ? onCopied(' SQL') : onCopyFail()))
                    }
                  >
                    复制
                  </button>
                )}
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