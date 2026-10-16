import { draftAlterTable, draftCreateTable } from '@shared/ddlDraft'
import { schemaForTables, searchRelevantTables } from '@shared/tableCatalog'
import type { TableSpec } from '@shared/schema'
import type { AiEvent } from '@shared/types'

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

async function streamText(
  requestId: string,
  text: string,
  mode: 'model' | 'preview',
  signal: AbortSignal,
  send: (event: AiEvent) => void,
): Promise<void> {
  const chunks = text.match(/.{1,4}/gs) ?? [text]
  for (const chunk of chunks) {
    if (signal.aborted) throw new DOMException('Aborted', 'AbortError')
    send({ requestId, type: 'delta', delta: chunk, mode })
    await delayOrAbort(8, signal)
  }
}

function progress(
  requestId: string,
  mode: 'model' | 'preview',
  send: (event: AiEvent) => void,
  step: string,
  detail?: string,
) {
  send({ requestId, type: 'progress', mode, step, detail })
}

async function completeOnce(options: {
  baseUrl: string
  model: string
  apiKey: string
  signal: AbortSignal
  system: string
  user: string
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
      messages: [
        { role: 'system', content: options.system },
        { role: 'user', content: options.user },
      ],
    }),
  })
  if (!response.ok) {
    const detail = await response.text().catch(() => '')
    throw new Error(detail.slice(0, 240) || `接口返回 ${response.status}`)
  }
  const json = (await response.json()) as { choices?: { message?: { content?: string } }[] }
  const content = json.choices?.[0]?.message?.content?.trim()
  if (!content) throw new Error('模型没有返回 DDL')
  return content
}

export async function streamCreateTable(options: {
  requestId: string
  prompt: string
  dialect: string
  tables: TableSpec[]
  referenceTable?: string
  history?: string
  baseUrl: string
  model: string
  apiKey: string
  signal: AbortSignal
  send: (event: AiEvent) => void
}): Promise<void> {
  const mode = options.apiKey ? 'model' : 'preview'
  progress(options.requestId, mode, options.send, '理解建表需求', options.prompt.slice(0, 80))

  let reference: TableSpec | null = null
  if (options.referenceTable) {
    reference = options.tables.find((t) => t.name === options.referenceTable) ?? null
    progress(options.requestId, mode, options.send, '读取参考表风格', options.referenceTable)
  } else {
    const hits = searchRelevantTables(options.tables, options.prompt, 1)
    if (hits[0]) {
      reference = options.tables.find((t) => t.name === hits[0].name) ?? null
      if (reference) progress(options.requestId, mode, options.send, '推断参考表', reference.name)
    }
  }

  const schema = schemaForTables(
    options.tables,
    reference ? [reference.name] : searchRelevantTables(options.tables, options.prompt, 3).map((h) => h.name),
  )

  if (!options.apiKey) {
    progress(options.requestId, mode, options.send, '本地起草 CREATE TABLE')
    const sql = draftCreateTable({ prompt: options.prompt, dialect: options.dialect, reference })
    const text = `按当前库风格起草建表语句。确认后可一键执行。\n\n\`\`\`sql\n${sql}\n\`\`\``
    await streamText(options.requestId, text, 'preview', options.signal, options.send)
    options.send({ requestId: options.requestId, type: 'done', mode: 'preview' })
    return
  }

  progress(options.requestId, mode, options.send, '模型生成 CREATE TABLE')
  const content = await completeOnce({
    baseUrl: options.baseUrl,
    model: options.model,
    apiKey: options.apiKey,
    signal: options.signal,
    system: `你是 DataAI 建表助手。为 ${options.dialect} 生成一条 CREATE TABLE。
用一两句中文说明，然后只给一个 \`\`\`sql 代码块。
参考现有表命名与类型风格，不要编造无关表。不要执行。`,
    user: `需求：${options.prompt}\n参考表：${options.referenceTable || reference?.name || '无'}\n现有结构：\n${schema || '（空库）'}\n对话：\n${options.history || '无'}`,
  })
  await streamText(options.requestId, content, 'model', options.signal, options.send)
  options.send({ requestId: options.requestId, type: 'done', mode: 'model' })
}

export async function streamAlterTable(options: {
  requestId: string
  prompt: string
  dialect: string
  tables: TableSpec[]
  targetTable?: string
  history?: string
  baseUrl: string
  model: string
  apiKey: string
  signal: AbortSignal
  send: (event: AiEvent) => void
}): Promise<void> {
  const mode = options.apiKey ? 'model' : 'preview'
  progress(options.requestId, mode, options.send, '理解改表需求', options.prompt.slice(0, 80))

  let table = options.targetTable || ''
  if (!table) {
    const hits = searchRelevantTables(options.tables, options.prompt, 1)
    table = hits[0]?.name || options.tables[0]?.name || ''
  }
  const spec = options.tables.find((t) => t.name === table) ?? null
  progress(options.requestId, mode, options.send, '目标表', table || '未知')
  if (spec) {
    progress(options.requestId, mode, options.send, '读取表结构', spec.columns.map((c) => c.name).slice(0, 8).join(', '))
  }

  if (!options.apiKey) {
    progress(options.requestId, mode, options.send, '本地起草 ALTER TABLE')
    const sql = draftAlterTable({ prompt: options.prompt, dialect: options.dialect, table: table || 'target_table', tableSpec: spec })
    const text = `请确认下面的改表语句，确认后再执行。\n\n\`\`\`sql\n${sql}\n\`\`\``
    await streamText(options.requestId, text, 'preview', options.signal, options.send)
    options.send({ requestId: options.requestId, type: 'done', mode: 'preview' })
    return
  }

  progress(options.requestId, mode, options.send, '模型生成 ALTER TABLE')
  const schema = schemaForTables(options.tables, table ? [table] : [])
  const content = await completeOnce({
    baseUrl: options.baseUrl,
    model: options.model,
    apiKey: options.apiKey,
    signal: options.signal,
    system: `你是 DataAI 改表助手。为 ${options.dialect} 生成必要的 ALTER TABLE。
用一两句中文说明风险与改动，然后只给一个 \`\`\`sql 代码块。
不要删除未提到的列。不要执行。`,
    user: `需求：${options.prompt}\n目标表：${table || '未知'}\n表结构：\n${schema || '（无）'}\n对话：\n${options.history || '无'}`,
  })
  await streamText(options.requestId, content, 'model', options.signal, options.send)
  options.send({ requestId: options.requestId, type: 'done', mode: 'model' })
}
