import { draftLocalAnswer } from '@shared/session'
import type { AiEvent } from '@shared/types'

export type StreamTarget = {
  requestId: string
  send: (event: AiEvent) => void
}

const SYSTEM = `你是 DataAI 的 SQL 助手。根据给出的表结构起草 SQLite 查询。
用一两句中文说明意图，然后只给一个 \`\`\`sql 代码块。
不要编造不存在的表或字段。不要执行语句。`

export async function streamAnswer(options: {
  requestId: string
  prompt: string
  schema: string
  dialect: string
  baseUrl: string
  model: string
  apiKey: string
  signal: AbortSignal
  send: (event: AiEvent) => void
}): Promise<void> {
  const mode = options.apiKey ? 'model' : 'preview'
  if (!options.apiKey) {
    await streamPreview(options.requestId, draftLocalAnswer(options.prompt), options.signal, options.send)
    return
  }

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
      stream: true,
      messages: [
        { role: 'system', content: SYSTEM },
        {
          role: 'user',
          content: `数据库：${options.dialect}\n表结构：\n${options.schema || '（尚未读取到表）'}\n\n问题：${options.prompt}`,
        },
      ],
    }),
  })

  if (!response.ok || !response.body) {
    const detail = await response.text().catch(() => '')
    throw new Error(detail.slice(0, 240) || `接口返回 ${response.status}`)
  }

  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  while (true) {
    const { value, done } = await reader.read()
    if (done) break
    buffer += decoder.decode(value, { stream: true })
    const lines = buffer.split('\n')
    buffer = lines.pop() ?? ''
    for (const line of lines) {
      const trimmed = line.trim()
      if (!trimmed.startsWith('data:')) continue
      const data = trimmed.slice(5).trim()
      if (data === '[DONE]') {
        options.send({ requestId: options.requestId, type: 'done', mode })
        return
      }
      try {
        const json = JSON.parse(data) as { choices?: { delta?: { content?: string } }[] }
        const delta = json.choices?.[0]?.delta?.content
        if (delta) options.send({ requestId: options.requestId, type: 'delta', delta, mode })
      } catch {
        // Incomplete SSE chunks are ignored until the next read.
      }
    }
  }
  options.send({ requestId: options.requestId, type: 'done', mode })
}

async function streamPreview(
  requestId: string,
  text: string,
  signal: AbortSignal,
  send: (event: AiEvent) => void,
): Promise<void> {
  const chunks = text.match(/.{1,3}/gs) ?? [text]
  for (const chunk of chunks) {
    if (signal.aborted) throw new DOMException('Aborted', 'AbortError')
    send({ requestId, type: 'delta', delta: chunk, mode: 'preview' })
    await new Promise((resolve) => setTimeout(resolve, 16))
  }
  send({ requestId, type: 'done', mode: 'preview' })
}
