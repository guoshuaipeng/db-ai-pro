import type { DesktopApi } from '@shared/contract'
import { connectionErrorNode } from '@shared/schema'
import { draftLocalAnswer, SAMPLE_CONNECTION_ID, SAMPLE_CONNECTION_NAME } from '@shared/session'
import { splitSql } from '@shared/sql'
import { dialectInfo } from '@shared/types'
import type {
  AiEvent,
  AiSettingsInput,
  AiSettingsPublic,
  ConnectionInput,
  ConnectionPublic,
  SchemaNode,
  StatementResult,
  WorkspaceState,
} from '@shared/types'

const memory = {
  connections: [] as ConnectionPublic[],
  workspace: null as WorkspaceState | null,
  settings: {
    baseUrl: 'https://api.openai.com/v1',
    model: 'gpt-4o-mini',
    hasKey: false,
    encryption: 'unavailable',
  } as AiSettingsPublic,
}

const listeners = new Set<(event: AiEvent) => void>()

function sampleSchema(): SchemaNode {
  const tables = [
    ['customers', '客户'],
    ['orders', '订单'],
    ['order_items', '订单明细'],
    ['products', '商品'],
  ]
  return {
    id: SAMPLE_CONNECTION_ID,
    kind: 'connection',
    name: SAMPLE_CONNECTION_NAME,
    displayName: SAMPLE_CONNECTION_NAME,
    dialect: 'sqlite',
    connectionId: SAMPLE_CONNECTION_ID,
    children: [
      {
        id: `${SAMPLE_CONNECTION_ID}:db`,
        kind: 'database',
        name: 'retail.db',
        displayName: 'retail.db',
        connectionId: SAMPLE_CONNECTION_ID,
          children: tables.map(([name, label]) => ({
          id: `${SAMPLE_CONNECTION_ID}:table:${name}`,
          kind: 'table' as const,
          name,
          displayName: label,
          dialect: 'sqlite' as const,
          connectionId: SAMPLE_CONNECTION_ID,
          tableName: name,
          children:
            name === 'customers'
              ? [
                  { id: `${SAMPLE_CONNECTION_ID}:column:customers:name`, kind: 'column' as const, name: 'name', displayName: 'name', dataType: 'TEXT', connectionId: SAMPLE_CONNECTION_ID, tableName: name },
                  { id: `${SAMPLE_CONNECTION_ID}:column:customers:region`, kind: 'column' as const, name: 'region', displayName: 'region', dataType: 'TEXT', connectionId: SAMPLE_CONNECTION_ID, tableName: name },
                ]
              : undefined,
        })),
      },
    ],
  }
}

function previewRows(sql: string): StatementResult {
  const started = performance.now()
  const done = (columns: string[], rows: Record<string, unknown>[]): StatementResult => ({
    statement: sql,
    ok: true,
    columns,
    rows,
    elapsedMs: Math.max(1, Math.round(performance.now() - started)),
  })

  if (/FROM customers/i.test(sql) && /AS 客户/.test(sql) && !/email IS NULL/i.test(sql)) {
    return done(['id', '客户', '区域', '城市', '状态', '邮箱'], [
      { id: 1, 客户: '林晓', 区域: '华东', 城市: '上海', 状态: '活跃', 邮箱: 'lin.xiao@example.com' },
      { id: 2, 客户: '周衡', 区域: '华东', 城市: '杭州', 状态: '活跃', 邮箱: null },
      { id: 4, 客户: '苏晚', 区域: '华南', 城市: '深圳', 状态: '活跃', 邮箱: null },
      { id: 5, 客户: '高见', 区域: '华北', 城市: '天津', 状态: '活跃', 邮箱: 'gao@example.com' },
      { id: 7, 客户: '沈清越', 区域: '华东', 城市: '上海', 状态: '活跃', 邮箱: 'shen@example.com' },
    ])
  }
  if (/AS 金额/.test(sql) && /GROUP BY c\.region/.test(sql)) {
    return done(['区域', '订单数', '金额'], [
      { 区域: '华东', 订单数: 4, 金额: 3286 },
      { 区域: '华北', 订单数: 4, 金额: 4120 },
      { 区域: '华南', 订单数: 3, 金额: 986 },
    ])
  }
  if (/total_cents >= 50000/.test(sql)) {
    return done(['订单号', '客户', '区域', '金额', '状态', '下单日'], [
      { 订单号: 9, 客户: '江澄', 区域: '华北', 金额: 2088, 状态: '已完成', 下单日: '2026-08-30' },
      { 订单号: 1, 客户: '林晓', 区域: '华东', 金额: 1526, 状态: '已完成', 下单日: '2026-09-02' },
      { 订单号: 5, 客户: '高见', 区域: '华北', 金额: 1280, 状态: '已完成', 下单日: '2026-10-08' },
    ])
  }
  if (/email IS NULL/i.test(sql)) {
    return done(['客户', '区域', '城市', '状态'], [
      { 客户: '周衡', 区域: '华东', 城市: '杭州', 状态: '活跃' },
      { 客户: '苏晚', 区域: '华南', 城市: '深圳', 状态: '活跃' },
    ])
  }
  if (/GROUP BY o\.status/.test(sql)) {
    return done(['状态', '订单数'], [
      { 状态: '已完成', 订单数: 7 },
      { 状态: '已支付', 订单数: 2 },
      { 状态: '待发货', 订单数: 2 },
      { 状态: '已取消', 订单数: 1 },
    ])
  }
  if (/AS 品类/.test(sql)) {
    return done(['品类', '销量', '均价'], [
      { 品类: '传感', 销量: 14, 均价: 89 },
      { 品类: '终端', 销量: 8, 均价: 279 },
      { 品类: '连接', 销量: 3, 均价: 1280 },
      { 品类: '配件', 销量: 6, 均价: 18 },
    ])
  }
  if (/^select\s+\*/i.test(sql.trim())) {
    return done(['id', 'name'], [
      { id: 1, name: '林晓' },
      { id: 2, name: '周衡' },
    ])
  }
  return {
    statement: sql,
    ok: false,
    error: '界面预览只回放示例查询。在桌面应用中会执行真实的 SQLite。',
    elapsedMs: 1,
  }
}

function schemaFor(connection: ConnectionPublic): SchemaNode {
  if (connection.id === SAMPLE_CONNECTION_ID || connection.dialect === 'sqlite') return sampleSchema()
  if (dialectInfo(connection.dialect).executable) {
    return connectionErrorNode(
      connection.id,
      connection.name,
      connection.dialect,
      '界面预览不能打开网络数据库。请在桌面应用里测试连接并查询。',
    )
  }
  return {
    id: connection.id,
    kind: 'connection',
    name: connection.name,
    displayName: connection.name,
    dialect: connection.dialect,
    connectionId: connection.id,
    children: [
      {
        id: `${connection.id}:note`,
        kind: 'note',
        name: 'pending-driver',
        displayName: '驱动尚未接入',
        note: '连接已保存在这台电脑上，查询会在后续版本打开。',
        connectionId: connection.id,
      },
    ],
  }
}

export function createPreviewApi(): DesktopApi {
  if (memory.connections.length === 0) {
    memory.connections = [
      {
        id: SAMPLE_CONNECTION_ID,
        name: SAMPLE_CONNECTION_NAME,
        dialect: 'sqlite',
        filePath: 'sample/retail.db',
        hasPassword: false,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
    ]
  }

  return {
    meta: async () => ({ version: '0.2.0', encryption: 'unavailable', mode: 'preview' }),
    connections: {
      list: async () => memory.connections,
      save: async (input: ConnectionInput) => {
        const now = new Date().toISOString()
        const existing = memory.connections.find((row) => row.id === input.id)
        const next: ConnectionPublic = {
          id: existing?.id ?? crypto.randomUUID(),
          name: input.name.trim(),
          dialect: input.dialect,
          filePath: input.filePath,
          host: input.host,
          port: input.port,
          database: input.database,
          username: input.username,
          hasPassword: input.password ? true : (existing?.hasPassword ?? false),
          createdAt: existing?.createdAt ?? now,
          updatedAt: now,
        }
        memory.connections = [...memory.connections.filter((row) => row.id !== next.id), next]
        return next
      },
      remove: async (id: string) => {
        memory.connections = memory.connections.filter((row) => row.id !== id)
      },
      schema: async (id: string) => {
        const connection = memory.connections.find((row) => row.id === id)
        if (!connection) throw new Error('连接不存在')
        if (connection.id === SAMPLE_CONNECTION_ID) return sampleSchema()
        return schemaFor(connection)
      },
      seedSample: async () => {
        const existing = memory.connections.find((row) => row.id === SAMPLE_CONNECTION_ID)
        if (existing) return existing
        const created: ConnectionPublic = {
          id: SAMPLE_CONNECTION_ID,
          name: SAMPLE_CONNECTION_NAME,
          dialect: 'sqlite',
          hasPassword: false,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        }
        memory.connections = [...memory.connections, created]
        return created
      },
      test: async (input: ConnectionInput) => {
        if (input.dialect === 'sqlite') {
          if (!input.filePath?.trim()) return { ok: false, error: '请选择 SQLite 文件' }
          return { ok: true }
        }
        if (dialectInfo(input.dialect).executable) {
          return { ok: false, error: '界面预览不能打开网络数据库。请在桌面应用里测试。' }
        }
        return { ok: false, error: '这个类型还不能查询。' }
      },
      pickFile: async () => null,
    },
    sql: {
      execute: async ({ sql }) => splitSql(sql).map((statement) => previewRows(statement)),
    },
    ai: {
      getSettings: async () => memory.settings,
      saveSettings: async (input: AiSettingsInput) => {
        memory.settings = {
          ...memory.settings,
          baseUrl: input.baseUrl,
          model: input.model,
          hasKey: input.apiKey ? true : input.apiKey === '' ? false : memory.settings.hasKey,
        }
        return memory.settings
      },
      start: async ({ requestId, prompt }) => {
        const text = draftLocalAnswer(prompt)
        const chunks = text.match(/.{1,3}/gs) ?? [text]
        for (const delta of chunks) {
          await new Promise((resolve) => setTimeout(resolve, 16))
          for (const listener of listeners) listener({ requestId, type: 'delta', delta, mode: 'preview' })
        }
        for (const listener of listeners) listener({ requestId, type: 'done', mode: 'preview' })
      },
      cancel: async () => undefined,
      onEvent: (listener) => {
        listeners.add(listener)
        return () => listeners.delete(listener)
      },
    },
    workspace: {
      load: async () => memory.workspace,
      save: async (state: WorkspaceState) => {
        memory.workspace = state
      },
    },
  }
}
