import type { TableSpec } from '@shared/schema'
import { enumHints, schemaForTables, searchRelevantTables } from '@shared/tableCatalog'

export type ToolName = 'search_relevant_tables' | 'get_table_schema' | 'get_column_enums' | 'generate_sample_inserts'

export type ToolCall = {
  name: ToolName
  arguments: Record<string, unknown>
}

export type ToolResult = {
  name: ToolName
  ok: boolean
  summary: string
  detail: string
}

function asString(value: unknown): string {
  return typeof value === 'string' ? value : ''
}

function asStringArray(value: unknown): string[] {
  if (Array.isArray(value)) return value.map((item) => String(item))
  if (typeof value === 'string' && value.trim()) {
    return value.split(/[,，\s]+/).map((item) => item.trim()).filter(Boolean)
  }
  return []
}

export function runTool(tables: TableSpec[], call: ToolCall): ToolResult {
  if (call.name === 'search_relevant_tables') {
    const prompt = asString(call.arguments.prompt) || asString(call.arguments.query)
    const hits = searchRelevantTables(tables, prompt)
    const detail = hits.map((hit) => `${hit.name} (${hit.label}) score=${hit.score} · ${hit.reason}`).join('\n')
    return {
      name: call.name,
      ok: true,
      summary: hits.length ? `找到 ${hits.length} 张相关表` : '没有匹配的表',
      detail: detail || '（空）',
    }
  }

  if (call.name === 'get_table_schema') {
    const names = asStringArray(call.arguments.tables).length
      ? asStringArray(call.arguments.tables)
      : asStringArray(call.arguments.table_names)
    const single = asString(call.arguments.table)
    if (single) names.push(single)
    const detail = schemaForTables(tables, names)
    return {
      name: call.name,
      ok: Boolean(detail),
      summary: detail ? `已读取 ${names.length || '候选'} 张表结构` : '没有可用表结构',
      detail: detail || '（空）',
    }
  }

  if (call.name === 'get_column_enums') {
    const table = asString(call.arguments.table) || asString(call.arguments.table_name)
    const columns = asStringArray(call.arguments.columns)
    const detail = enumHints(tables, table, columns)
    return {
      name: call.name,
      ok: Boolean(detail),
      summary: detail ? `已给出 ${table} 的枚举线索` : '没有可用的枚举线索',
      detail: detail || '（空）',
    }
  }

  if (call.name === 'generate_sample_inserts') {
    return {
      name: call.name,
      ok: true,
      summary: '请在表结构面板使用「样例数据」生成可预览的 INSERT',
      detail:
        'DataAI 桌面端在表结构面板提供样例数据填充：按列类型生成 N 行 INSERT，支持深色预览、写入编辑器或确认执行。参数提示：table、count(默认5)。',
    }
  }

  return { name: call.name, ok: false, summary: '未知工具', detail: '' }
}

export const OPENAI_TOOLS = [
  {
    type: 'function' as const,
    function: {
      name: 'search_relevant_tables',
      description: '根据自然语言问题检索最相关的表名',
      parameters: {
        type: 'object',
        properties: {
          prompt: { type: 'string', description: '用户问题' },
        },
        required: ['prompt'],
      },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'get_table_schema',
      description: '读取一张或多张表的字段结构',
      parameters: {
        type: 'object',
        properties: {
          tables: { type: 'array', items: { type: 'string' } },
          table: { type: 'string' },
        },
      },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'get_column_enums',
      description: '给出适合做枚举过滤的列线索（不返回真实取值）',
      parameters: {
        type: 'object',
        properties: {
          table: { type: 'string' },
          columns: { type: 'array', items: { type: 'string' } },
        },
        required: ['table'],
      },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'generate_sample_inserts',
      description: '为指定表生成样例 INSERT（桌面端表结构面板可预览执行）',
      parameters: {
        type: 'object',
        properties: {
          table: { type: 'string' },
          count: { type: 'number' },
        },
        required: ['table'],
      },
    },
  },
]

