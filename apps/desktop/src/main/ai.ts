import { draftLocalAnswer } from '@shared/session'
import type { TableSpec } from '@shared/schema'
import { schemaForTables, searchRelevantTables } from '@shared/tableCatalog'
import type { AiEvent } from '@shared/types'
import { OPENAI_TOOLS, runTool, type ToolCall, type ToolName } from './tools'

const SYSTEM = `你是 DataAI 的 SQL 助手。先用工具确认相关表和字段，再起草查询。
规则：
1. 需要表名时调用 search_relevant_tables。
2. 写 SQL 前调用 get_table_schema 读取真实字段。
3. 涉及状态/区域/品类过滤时可调用 get_column_enums。
4. 最终用一两句中文说明意图，然后只给一个 \`\`\`sql 代码块。
5. 不要编造不存在的表或字段。不要执行语句。`

const REPAIR_SYSTEM = `你是 DataAI 的 SQL 修复助手。根据错误信息和表结构，给出修正后的 SQL。
用一两句中文说明改了什么，然后只给一个 \`\`\`sql 代码块。不要编造字段。`

type ChatMessage =
  | { role: 'system' | 'user' | 'assistant'; content: string }
  | { role: 'assistant'; content?: string | null; tool_calls: ToolCallMessage[] }
  | { role: 'tool'; tool_call_id: string; content: string }

type ToolCallMessage = {
  id: string
  type: 'function'
  function: { name: string; arguments: string }
}

function sendProgress(
  requestId: string,
  mode: 'model' | 'preview',
  send: (event: AiEvent) => void,
  step: string,
  detail?: string,
): void {
  send({ requestId, type: 'progress', mode, step, detail })
}

async function delayOrAbort(ms: number, signal: AbortSignal): Promise<void> {
  if (signal.aborted) throw new DOMException('Aborted', 'AbortError')
  await new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => {
      signal.removeEventListener('abort', onAbort)
      resolve()
    }, ms)
    const onAbort = () => {
      clearTimeout(timer)
      reject(new DOMException('Aborted', 'AbortError'))
    }
    signal.addEventListener('abort', onAbort, { once: true })
  })
}

async function streamPreviewText(
  requestId: string,
  text: string,
  signal: AbortSignal,
  send: (event: AiEvent) => void,
  mode: 'model' | 'preview' = 'preview',
): Promise<void> {
  const chunks = text.match(/.{1,4}/gs) ?? [text]
  for (const chunk of chunks) {
    if (signal.aborted) throw new DOMException('Aborted', 'AbortError')
    send({ requestId, type: 'delta', delta: chunk, mode })
    await delayOrAbort(10, signal)
  }
}

export async function streamAnswer(options: {
  requestId: string
  prompt: string
  tables: TableSpec[]
  dialect: string
  baseUrl: string
  model: string
  apiKey: string
  signal: AbortSignal
  send: (event: AiEvent) => void
}): Promise<void> {
  if (!options.apiKey) {
    await runLocalPreview(options)
    return
  }
  await runModelAgent(options)
}

export async function streamRepair(options: {
  requestId: string
  sql: string
  error: string
  tables: TableSpec[]
  dialect: string
  baseUrl: string
  model: string
  apiKey: string
  signal: AbortSignal
  send: (event: AiEvent) => void
}): Promise<void> {
  const mode = options.apiKey ? 'model' : 'preview'
  sendProgress(options.requestId, mode, options.send, '分析执行错误', options.error.slice(0, 160))
  const schema = schemaForTables(
    options.tables,
    searchRelevantTables(options.tables, `${options.sql} ${options.error}`, 6).map((hit) => hit.name),
  )

  if (!options.apiKey) {
    const text =
      `执行失败：${options.error}\n\n先核对表名与字段，再试下面这版（本地预览，未调用模型）：\n\n\`\`\`sql\n${options.sql.trim()}\n\`\`\``
    await streamPreviewText(options.requestId, text, options.signal, options.send)
    options.send({ requestId: options.requestId, type: 'done', mode: 'preview' })
    return
  }

  const content = await completeOnce({
    baseUrl: options.baseUrl,
    model: options.model,
    apiKey: options.apiKey,
    signal: options.signal,
    messages: [
      { role: 'system', content: REPAIR_SYSTEM },
      {
        role: 'user',
        content: `数据库：${options.dialect}\n表结构：\n${schema || '（无）'}\n\n失败 SQL：\n${options.sql}\n\n错误：\n${options.error}`,
      },
    ],
  })
  await streamPreviewText(options.requestId, content, options.signal, options.send, 'model')
  options.send({ requestId: options.requestId, type: 'done', mode: 'model' })
}

async function runLocalPreview(options: {
  requestId: string
  prompt: string
  tables: TableSpec[]
  signal: AbortSignal
  send: (event: AiEvent) => void
}): Promise<void> {
  sendProgress(options.requestId, 'preview', options.send, 'search_relevant_tables', '按问题检索相关表')
  const hits = searchRelevantTables(options.tables, options.prompt)
  sendProgress(
    options.requestId,
    'preview',
    options.send,
    '相关表',
    hits.map((hit) => hit.name).join(', ') || '（使用默认候选）',
  )
  sendProgress(options.requestId, 'preview', options.send, 'get_table_schema', '读取字段结构')
  const schema = schemaForTables(
    options.tables,
    hits.map((hit) => hit.name),
  )
  sendProgress(options.requestId, 'preview', options.send, '表结构就绪', schema.split('\n').slice(0, 3).join(' · '))
  const answer = draftLocalAnswer(options.prompt)
  await streamPreviewText(options.requestId, answer, options.signal, options.send)
  options.send({ requestId: options.requestId, type: 'done', mode: 'preview' })
}

async function runModelAgent(options: {
  requestId: string
  prompt: string
  tables: TableSpec[]
  dialect: string
  baseUrl: string
  model: string
  apiKey: string
  signal: AbortSignal
  send: (event: AiEvent) => void
}): Promise<void> {
  const messages: ChatMessage[] = [
    { role: 'system', content: SYSTEM },
    {
      role: 'user',
      content: `数据库：${options.dialect}\n可用表数量：${options.tables.length}\n问题：${options.prompt}`,
    },
  ]

  for (let round = 0; round < 5; round += 1) {
    if (options.signal.aborted) throw new DOMException('Aborted', 'AbortError')
    sendProgress(options.requestId, 'model', options.send, `推理第 ${round + 1} 轮`)
    const response = await fetch(`${options.baseUrl.replace(/\/$/, '')}/chat/completions`, {
      method: 'POST',
      signal: options.signal,
      headers: {
        Authorization: `Bearer ${options.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: options.model,
        temperature: 0.2,
        tools: OPENAI_TOOLS,
        messages,
      }),
    })
    if (!response.ok) {
      const detail = await response.text().catch(() => '')
      throw new Error(detail.slice(0, 240) || `接口返回 ${response.status}`)
    }
    const json = (await response.json()) as {
      choices?: {
        message?: {
          content?: string | null
          tool_calls?: ToolCallMessage[]
        }
        finish_reason?: string
      }[]
    }
    const message = json.choices?.[0]?.message
    if (!message) throw new Error('模型没有返回内容')

    const toolCalls = message.tool_calls ?? []
    if (toolCalls.length > 0) {
      messages.push({ role: 'assistant', content: message.content, tool_calls: toolCalls })
      for (const call of toolCalls) {
        const name = call.function.name as ToolName
        let args: Record<string, unknown> = {}
        try {
          args = JSON.parse(call.function.arguments || '{}') as Record<string, unknown>
        } catch {
          args = {}
        }
        if (name === 'search_relevant_tables' && !args.prompt) args.prompt = options.prompt
        const toolCall: ToolCall = { name, arguments: args }
        sendProgress(options.requestId, 'model', options.send, name, JSON.stringify(args).slice(0, 120))
        const result = runTool(options.tables, toolCall)
        sendProgress(options.requestId, 'model', options.send, result.summary, result.detail.split('\n')[0])
        messages.push({
          role: 'tool',
          tool_call_id: call.id,
          content: `${result.summary}\n${result.detail}`,
        })
      }
      continue
    }

    const content = (message.content ?? '').trim()
    if (!content) throw new Error('模型没有给出 SQL')
    await streamPreviewText(options.requestId, content, options.signal, options.send, 'model')
    options.send({ requestId: options.requestId, type: 'done', mode: 'model' })
    return
  }

  throw new Error('工具轮次过多，请缩小问题范围后再试')
}

async function completeOnce(options: {
  baseUrl: string
  model: string
  apiKey: string
  signal: AbortSignal
  messages: ChatMessage[]
}): Promise<string> {
  const response = await fetch(`${options.baseUrl.replace(/\/$/, '')}/chat/completions`, {
    method: 'POST',
    signal: options.signal,
    headers: {
      Authorization: `Bearer ${options.apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: options.model,
      temperature: 0.2,
      messages: options.messages,
    }),
  })
  if (!response.ok) {
    const detail = await response.text().catch(() => '')
    throw new Error(detail.slice(0, 240) || `接口返回 ${response.status}`)
  }
  const json = (await response.json()) as { choices?: { message?: { content?: string } }[] }
  const content = json.choices?.[0]?.message?.content?.trim()
  if (!content) throw new Error('模型没有返回修复结果')
  return content
}
