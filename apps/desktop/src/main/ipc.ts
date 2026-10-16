import { join } from 'node:path'
import { BrowserWindow, dialog, ipcMain } from 'electron'
import { SAMPLE_CONNECTION_ID, SAMPLE_CONNECTION_NAME } from '@shared/session'
import type { AiEvent, AiSettingsInput, ConnectionInput, SchemaNode, WorkspaceState } from '@shared/types'
import { dialectInfo } from '@shared/types'
import { streamAnswer } from './ai'
import { ensureParent, seedRetailDatabase } from './sampleDb'
import { encryptionAvailable } from './secrets'
import {
  databaseExists,
  describeSchema,
  executeScript,
  listSchema,
  openDatabase,
} from './sqlite'
import {
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
import type Database from 'better-sqlite3'

const handles = new Map<string, Database.Database>()
const aborts = new Map<string, AbortController>()

function closeHandle(id: string): void {
  const handle = handles.get(id)
  if (!handle) return
  handle.close()
  handles.delete(id)
}

function sqliteHandle(id: string, filePath: string): Database.Database {
  const cached = handles.get(id)
  if (cached) return cached
  const db = openDatabase(filePath)
  handles.set(id, db)
  return db
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
  closeHandle(SAMPLE_CONNECTION_ID)
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
    version: '0.1.0',
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
    if (input.id) closeHandle(input.id)
    const saved = saveConnection(input)
    if ('error' in saved) return saved
    return { connection: saved.connection }
  })

  ipcMain.handle('connections:remove', (_event, id: string) => {
    closeHandle(id)
    removeConnection(id)
  })

  ipcMain.handle('connections:seedSample', () => {
    const created = createSample(userData)
    if ('error' in created) return created
    return { connection: created.connection }
  })

  ipcMain.handle('connections:schema', (_event, id: string) => {
    const row = getConnection(id)
    if (!row) return { error: '连接不存在' }
    const info = dialectInfo(row.dialect)
    if (!info.executable) return { schema: savedNote(row.id, row.name, row.dialect) }
    if (!row.filePath || !databaseExists(row.filePath)) return { error: '找不到数据库文件' }
    try {
      const db = sqliteHandle(row.id, row.filePath)
      return { schema: listSchema(row.id, row.name, row.filePath, db) }
    } catch (error) {
      const message = error instanceof Error ? error.message : '无法读取对象'
      return { error: message }
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

  ipcMain.handle('sql:execute', (_event, payload: { connectionId: string; sql: string }) => {
    const row = getConnection(payload.connectionId)
    if (!row) return { error: '连接不存在' }
    if (row.dialect !== 'sqlite' || !row.filePath) {
      return { error: '这个里程碑只执行 SQLite。连接已保存，驱动将在后续版本接入。' }
    }
    if (!databaseExists(row.filePath)) return { error: '找不到数据库文件' }
    try {
      const db = sqliteHandle(row.id, row.filePath)
      return { results: executeScript(db, payload.sql) }
    } catch (error) {
      const message = error instanceof Error ? error.message : '执行失败'
      return { error: message }
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
        if (row?.dialect === 'sqlite' && row.filePath && databaseExists(row.filePath)) {
          schema = describeSchema(sqliteHandle(row.id, row.filePath))
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
  for (const id of handles.keys()) closeHandle(id)
  for (const controller of aborts.values()) controller.abort()
  aborts.clear()
}
