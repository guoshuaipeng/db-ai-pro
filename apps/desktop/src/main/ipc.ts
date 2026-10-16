import { createRequire } from 'node:module'
import { join } from 'node:path'
import { BrowserWindow, dialog, ipcMain } from 'electron'

const require = createRequire(import.meta.url)
const pkg = require('../../package.json') as { version: string }
import { connectionErrorNode } from '@shared/schema'
import { tablesFromDescribe } from '@shared/describeParse'
import { SAMPLE_CONNECTION_ID, SAMPLE_CONNECTION_NAME } from '@shared/session'
import type { AiEvent, AiSettingsInput, ConnectionInput, SchemaNode, WorkspaceState } from '@shared/types'
import { canInspect, dialectInfo, isKvDialect } from '@shared/types'
import { streamAnswer, streamRepair } from './ai'
import { streamAlterTable, streamCreateTable } from './aiDdl'
import { explainDbError } from './errors'
import { ensureParent, seedRetailDatabase } from './sampleDb'
import { encryptionAvailable } from './secrets'
import {
  closeAllSessions,
  closeSession,
  describeSession,
  executeSession,
  probeTarget,
  schemaForSession,
} from './sessions'
import type { SqlTarget } from './target'
import { readRedisValue, scanRedisKeys } from './redis'
import { databaseExists, openDatabase } from './sqlite'
import {
  appendQueryHistory,
  clearQueryHistory,
  connectionPassword,
  getConnection,
  hasConnectionStore,
  listConnections,
  listQueryHistory,
  loadWorkspace,
  removeConnection,
  removeQueryHistoryEntry,
  saveConnection,
  saveSettings,
  saveWorkspace,
  settingsPublic,
  settingsSecrets,
} from './store'

const aborts = new Map<string, AbortController>()

function targetFromStored(row: NonNullable<ReturnType<typeof getConnection>>): SqlTarget {
  const secret = connectionPassword(row)
  if (secret.locked) throw new Error('系统密钥环不可用，无法读取已保存的密码。')
  return {
    id: row.id,
    name: row.name,
    dialect: row.dialect,
    filePath: row.filePath,
    host: row.host,
    port: row.port ?? dialectInfo(row.dialect).defaultPort,
    database: row.database,
    username: row.username,
    password: secret.password,
  }
}

function targetFromInput(input: ConnectionInput): SqlTarget {
  const stored = input.id ? getConnection(input.id) : undefined
  const typed = input.password ?? ''
  let password = typed
  if (!typed && stored) {
    const secret = connectionPassword(stored)
    if (secret.locked) throw new Error('系统密钥环不可用，无法读取已保存的密码。')
    password = secret.password
  }
  return {
    id: input.id ?? 'probe',
    name: input.name,
    dialect: input.dialect,
    filePath: input.filePath,
    host: input.host,
    port: input.port ?? dialectInfo(input.dialect).defaultPort,
    database: input.database,
    username: input.username,
    password,
  }
}

export function sampleFilePath(userData: string): string {
  return join(userData, 'sample', 'retail.db')
}

export function createSample(userData: string) {
  const filePath = sampleFilePath(userData)
  if (!databaseExists(filePath)) {
    ensureParent(filePath)
    const db = openDatabase(filePath)
    seedRetailDatabase(db)
    db.close()
  }
  void closeSession(SAMPLE_CONNECTION_ID)
  return saveConnection({
    id: SAMPLE_CONNECTION_ID,
    name: SAMPLE_CONNECTION_NAME,
    dialect: 'sqlite',
    filePath,
  })
}

export function ensureFirstLaunchSample(userData: string): void {
  if (hasConnectionStore()) return
  const created = createSample(userData)
  if ('error' in created) throw new Error(created.error)
}

function savedNote(connectionId: string, name: string, dialect: SchemaNode['dialect']): SchemaNode {
  return {
    id: connectionId,
    kind: 'connection',
    name,
    displayName: name,
    dialect,
    connectionId,
    children: [
      {
        id: `${connectionId}:note`,
        kind: 'note',
        name: 'pending-driver',
        displayName: '驱动尚未接入',
        note: '连接已保存在这台电脑上，查询会在后续版本打开。',
        connectionId,
      },
    ],
  }
}

async function loadTables(connectionId: string | null) {
  const row = connectionId ? getConnection(connectionId) : undefined
  if (!row || !dialectInfo(row.dialect).executable) return []
  try {
    const text = await describeSession(targetFromStored(row))
    return tablesFromDescribe(text)
  } catch {
    return []
  }
}

export function registerIpc(getWindow: () => BrowserWindow | null, userData: string): void {
  ipcMain.handle('meta:get', () => ({
    version: pkg.version,
    encryption: encryptionAvailable() ? 'os' : 'unavailable',
    mode: 'desktop' as const,
  }))

  ipcMain.handle('connections:list', () => listConnections())

  ipcMain.handle('connections:save', (_event, input: ConnectionInput) => {
    if (input.dialect === 'sqlite' && input.filePath) {
      const filePath = input.filePath
      if (!databaseExists(filePath)) {
        if (!input.createFile) return { error: '找不到数据库文件' }
        ensureParent(filePath)
        const created = openDatabase(filePath)
        created.close()
      }
    }
    if (input.id) void closeSession(input.id)
    const saved = saveConnection(input)
    if ('error' in saved) return saved
    return { connection: saved.connection }
  })

  ipcMain.handle('connections:remove', (_event, id: string) => {
    void closeSession(id)
    removeConnection(id)
  })

  ipcMain.handle('connections:seedSample', () => {
    const created = createSample(userData)
    if ('error' in created) return created
    return { connection: created.connection }
  })

  ipcMain.handle('connections:test', async (_event, input: ConnectionInput) => {
    try {
      await probeTarget(targetFromInput(input))
      return { ok: true }
    } catch (error) {
      return { ok: false, error: explainDbError(error) }
    }
  })

  ipcMain.handle('connections:schema', async (_event, id: string) => {
    const row = getConnection(id)
    if (!row) return { error: '连接不存在' }
    if (!canInspect(row.dialect)) return { schema: savedNote(row.id, row.name, row.dialect) }
    try {
      return { schema: await schemaForSession(targetFromStored(row)) }
    } catch (error) {
      return { schema: connectionErrorNode(row.id, row.name, row.dialect, explainDbError(error)) }
    }
  })

  ipcMain.handle('connections:pickFile', async (_event, mode: 'open' | 'save') => {
    const win = getWindow()
    const filters = [{ name: 'SQLite', extensions: ['db', 'sqlite', 'sqlite3'] }]
    if (mode === 'save') {
      const options = { title: '保存 SQLite 数据库', filters }
      const result = win ? await dialog.showSaveDialog(win, options) : await dialog.showSaveDialog(options)
      return result.canceled ? null : result.filePath
    }
    const options = { title: '选择 SQLite 数据库', properties: ['openFile'] as Array<'openFile'>, filters }
    const result = win ? await dialog.showOpenDialog(win, options) : await dialog.showOpenDialog(options)
    return result.canceled ? null : (result.filePaths[0] ?? null)
  })

  ipcMain.handle('sql:execute', async (_event, payload: { connectionId: string; sql: string }) => {
    const row = getConnection(payload.connectionId)
    if (!row) return { error: '连接不存在' }
    if (!dialectInfo(row.dialect).executable) return { error: '这个类型还不能查询。连接已保存在本机。' }
    try {
      const results = await executeSession(targetFromStored(row), payload.sql)
      const failed = results.find((item) => !item.ok)
      const elapsedMs = results.reduce((sum, item) => sum + (item.elapsedMs || 0), 0)
      appendQueryHistory({
        connectionId: payload.connectionId,
        sql: payload.sql,
        ok: !failed,
        error: failed?.error,
        elapsedMs,
      })
      return { results }
    } catch (error) {
      const message = explainDbError(error)
      appendQueryHistory({
        connectionId: payload.connectionId,
        sql: payload.sql,
        ok: false,
        error: message,
      })
      return { error: message }
    }
  })

  ipcMain.handle('history:list', (_event, connectionId: string) => listQueryHistory(connectionId))
  ipcMain.handle('history:clear', (_event, connectionId: string) => {
    clearQueryHistory(connectionId)
  })
  ipcMain.handle('history:remove', (_event, payload: { connectionId: string; entryId: string }) => {
    removeQueryHistoryEntry(payload.connectionId, payload.entryId)
  })

  ipcMain.handle(
    'sql:updateSqliteCell',
    async (
      _event,
      payload: { connectionId: string; table: string; rowid: number; column: string; value: string | number | null },
    ) => {
      const row = getConnection(payload.connectionId)
      if (!row) return { error: '连接不存在' }
      if (row.dialect !== 'sqlite') return { error: '仅 SQLite 支持结果格内编辑' }
      if (!/^[A-Za-z_][\w]*$/.test(payload.table) || !/^[A-Za-z_][\w]*$/.test(payload.column)) {
        return { error: '表名或列名不合法' }
      }
      if (payload.column === '__rowid__' || payload.column.toLowerCase() === 'rowid') {
        return { error: '不能编辑 rowid' }
      }
      try {
        const valueSql =
          payload.value === null
            ? 'NULL'
            : typeof payload.value === 'number'
              ? String(payload.value)
              : `'${String(payload.value).replace(/'/g, "''")}'`
        const sql = `UPDATE "${payload.table.replace(/"/g, '""')}" SET "${payload.column.replace(/"/g, '""')}" = ${valueSql} WHERE rowid = ${Number(payload.rowid)}`
        return { results: await executeSession(targetFromStored(row), sql) }
      } catch (error) {
        return { error: explainDbError(error) }
      }
    },
  )

  ipcMain.handle(
    'redis:scan',
    async (_event, payload: { connectionId: string; pattern?: string; count?: number }) => {
      const row = getConnection(payload.connectionId)
      if (!row) return { error: '连接不存在' }
      if (!isKvDialect(row.dialect)) return { error: '当前连接不是 Redis' }
      try {
        const keys = await scanRedisKeys(targetFromStored(row), payload.pattern ?? '*', payload.count ?? 120)
        return { keys }
      } catch (error) {
        return { error: explainDbError(error) }
      }
    },
  )

  ipcMain.handle('redis:get', async (_event, payload: { connectionId: string; key: string }) => {
    const row = getConnection(payload.connectionId)
    if (!row) return { error: '连接不存在' }
    if (!isKvDialect(row.dialect)) return { error: '当前连接不是 Redis' }
    try {
      const value = await readRedisValue(targetFromStored(row), payload.key)
      return { value }
    } catch (error) {
      return { error: explainDbError(error) }
    }
  })

  ipcMain.handle('ai:getSettings', () => settingsPublic())
  ipcMain.handle('ai:saveSettings', (_event, input: AiSettingsInput) => saveSettings(input))

  const runAi = async (
    payload: { requestId: string; connectionId: string | null },
    work: (send: (event: AiEvent) => void, signal: AbortSignal) => Promise<void>,
  ) => {
    const win = getWindow()
    const send = (event: AiEvent) => {
      if (!win || win.isDestroyed()) return
      win.webContents.send('ai:event', event)
    }
    const controller = new AbortController()
    aborts.set(payload.requestId, controller)
    try {
      await work(send, controller.signal)
    } catch (error) {
      if (controller.signal.aborted) return
      const message = error instanceof Error ? error.message : '助手没有完成这次起草'
      send({ requestId: payload.requestId, type: 'error', message })
    } finally {
      aborts.delete(payload.requestId)
    }
  }

  ipcMain.handle(
    'ai:start',
    async (
      _event,
      payload: {
        requestId: string
        connectionId: string | null
        prompt: string
        intent?: 'query' | 'create' | 'alter'
        referenceTable?: string
        targetTable?: string
        history?: string
      },
    ) => {
      await runAi(payload, async (send, signal) => {
        const row = payload.connectionId ? getConnection(payload.connectionId) : undefined
        const tables = await loadTables(payload.connectionId)
        const settings = settingsSecrets()
        const dialect = row?.dialect ?? 'sqlite'
        const intent = payload.intent ?? 'query'
        if (intent === 'create') {
          await streamCreateTable({
            requestId: payload.requestId,
            prompt: payload.prompt,
            tables,
            dialect,
            referenceTable: payload.referenceTable,
            history: payload.history,
            baseUrl: settings.baseUrl,
            model: settings.model,
            apiKey: settings.apiKey,
            signal,
            send,
          })
          return
        }
        if (intent === 'alter') {
          await streamAlterTable({
            requestId: payload.requestId,
            prompt: payload.prompt,
            tables,
            dialect,
            targetTable: payload.targetTable,
            history: payload.history,
            baseUrl: settings.baseUrl,
            model: settings.model,
            apiKey: settings.apiKey,
            signal,
            send,
          })
          return
        }
        await streamAnswer({
          requestId: payload.requestId,
          prompt: payload.prompt,
          tables,
          dialect,
          baseUrl: settings.baseUrl,
          model: settings.model,
          apiKey: settings.apiKey,
          signal,
          send,
        })
      })
    },
  )

  ipcMain.handle(
    'ai:repair',
    async (
      _event,
      payload: { requestId: string; connectionId: string | null; sql: string; error: string },
    ) => {
      await runAi(payload, async (send, signal) => {
        const row = payload.connectionId ? getConnection(payload.connectionId) : undefined
        const tables = await loadTables(payload.connectionId)
        const settings = settingsSecrets()
        await streamRepair({
          requestId: payload.requestId,
          sql: payload.sql,
          error: payload.error,
          tables,
          dialect: row?.dialect ?? 'sqlite',
          baseUrl: settings.baseUrl,
          model: settings.model,
          apiKey: settings.apiKey,
          signal,
          send,
        })
      })
    },
  )

  ipcMain.handle('ai:cancel', (_event, requestId: string) => {
    aborts.get(requestId)?.abort()
    aborts.delete(requestId)
  })

  ipcMain.handle('workspace:load', () => loadWorkspace())
  ipcMain.handle('workspace:save', (_event, state: WorkspaceState) => {
    saveWorkspace(state)
  })
}

export function closeAllHandles(): void {
  void closeAllSessions()
  for (const controller of aborts.values()) controller.abort()
  aborts.clear()
}
