import { createRequire } from 'node:module'
import { join } from 'node:path'
import { BrowserWindow, dialog, ipcMain } from 'electron'

const require = createRequire(import.meta.url)
const pkg = require('../../package.json') as { version: string }
import { connectionErrorNode } from '@shared/schema'
import { SAMPLE_CONNECTION_ID, SAMPLE_CONNECTION_NAME } from '@shared/session'
import type { AiEvent, AiSettingsInput, ConnectionInput, SchemaNode, WorkspaceState } from '@shared/types'
import { dialectInfo } from '@shared/types'
import { streamAnswer } from './ai'
import { explainDbError } from './errors'
import { ensureParent, seedRetailDatabase } from './sampleDb'
import { encryptionAvailable } from './secrets'
import { closeAllSessions, closeSession, describeSession, executeSession, probeTarget, schemaForSession } from './sessions'
import type { SqlTarget } from './target'
import { databaseExists, openDatabase } from './sqlite'
import {
  connectionPassword,
  getConnection,
  hasConnectionStore,
  listConnections,
  loadWorkspace,
  removeConnection,
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
    const info = dialectInfo(row.dialect)
    if (!info.executable) return { schema: savedNote(row.id, row.name, row.dialect) }
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
      return { results: await executeSession(targetFromStored(row), payload.sql) }
    } catch (error) {
      return { error: explainDbError(error) }
    }
  })

  ipcMain.handle('ai:getSettings', () => settingsPublic())
  ipcMain.handle('ai:saveSettings', (_event, input: AiSettingsInput) => saveSettings(input))

  ipcMain.handle(
    'ai:start',
    async (
      _event,
      payload: { requestId: string; connectionId: string | null; prompt: string },
    ) => {
      const win = getWindow()
      const send = (event: AiEvent) => {
        if (!win || win.isDestroyed()) return
        win.webContents.send('ai:event', event)
      }
      const controller = new AbortController()
      aborts.set(payload.requestId, controller)
      try {
        const row = payload.connectionId ? getConnection(payload.connectionId) : undefined
        let schema = ''
        if (row && dialectInfo(row.dialect).executable) {
          try {
            schema = await describeSession(targetFromStored(row))
          } catch {
            schema = ''
          }
        }
        const settings = settingsSecrets()
        await streamAnswer({
          requestId: payload.requestId,
          prompt: payload.prompt,
          schema,
          dialect: row?.dialect ?? 'sqlite',
          baseUrl: settings.baseUrl,
          model: settings.model,
          apiKey: settings.apiKey,
          signal: controller.signal,
          send,
        })
      } catch (error) {
        if (controller.signal.aborted) return
        const message = error instanceof Error ? error.message : '助手没有完成这次起草'
        send({ requestId: payload.requestId, type: 'error', message })
      } finally {
        aborts.delete(payload.requestId)
      }
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
