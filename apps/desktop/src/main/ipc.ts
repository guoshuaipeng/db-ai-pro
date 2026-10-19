import { createRequire } from 'node:module'
import { join } from 'node:path'
import { app, BrowserWindow, dialog, ipcMain, shell } from 'electron'

const require = createRequire(import.meta.url)
const pkg = require('../../package.json') as { version: string }
import { clampZoomFactor } from '@shared/prefs'
import { connectionErrorNode } from '@shared/schema'
import { tablesFromDescribe } from '@shared/describeParse'
import { SAMPLE_CONNECTION_ID, SAMPLE_CONNECTION_NAME } from '@shared/session'
import type { AiEvent, AiSettingsInput, ConnectionInput, SchemaNode, WorkspaceState } from '@shared/types'
import { canInspect, dialectInfo, isKvDialect } from '@shared/types'
import { streamAnswer, streamRepair } from './ai'
import { streamAlterTable, streamCreateTable } from './aiDdl'
import { explainDbError } from './errors'
import { buildExplainSql } from '@shared/explain'
import type { ImportPlanItem } from '@shared/connectionTransfer'
import { copyFileSync, existsSync, writeFileSync, readFileSync } from 'node:fs'
import { ensureParent, seedRetailDatabase } from './sampleDb'
import { encryptionAvailable } from './secrets'
import {
  closeAllSessions,
  closeSession,
  describeSession,
  cancelQuery,
  executeSession,
  probeTarget,
  pingSession,
  schemaForSession,
  listInstanceDatabases,
  inspectTableSession,
  beginTransaction,
  commitTransaction,
  rollbackTransaction,
  transactionStatus,
  hasAnyOpenTransaction,
  isInTransaction,
} from './sessions'
import type { SqlTarget } from './target'
import { readRedisValue, scanRedisKeys } from './redis'
import { databaseExists, openDatabase } from './sqlite'
import { readImportFile } from './importFile'
import { previewPyQtImport } from './pyqtImport'
import {
  appendQueryHistory,
  applyConnectionImport,
  clearQueryHistory,
  connectionPassword,
  exportConnectionsBundle,
  loadPrefs,
  listRecentItems,
  recordRecentTable,
  recordRecentQuery,
  clearRecentItems,
  listConnectionGroups,
  saveConnectionGroup,
  removeConnectionGroup,
  savePrefs,
  getConnection,
  hasConnectionStore,
  listConnections,
  listFavorites,
  listFavoriteFolders,
  saveFavoriteFolder,
  removeFavoriteFolder,
  listQueryHistory,
  loadWorkspace,
  loadSchemaCache,
  saveSchemaCache,
  previewConnectionImport,
  removeConnection,
  removeFavorite,
  removeQueryHistoryEntry,
  saveConnection,
  duplicateConnection,
  saveFavorite,
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

/** Packaged sample (extraResources) or repo resources/samples in dev. Never open this path as the live DB. */
export function packagedSamplePath(): string | undefined {
  const candidates = [
    join(process.resourcesPath, 'samples', 'retail.db'),
    join(process.cwd(), '../../resources/samples/retail.db'),
    join(app.getAppPath(), '../../../resources/samples/retail.db'),
    join(app.getAppPath(), '../../resources/samples/retail.db'),
  ]
  return candidates.find((path) => existsSync(path))
}

export function createSample(userData: string) {
  const filePath = sampleFilePath(userData)
  if (!databaseExists(filePath)) {
    ensureParent(filePath)
    const packaged = packagedSamplePath()
    if (packaged) {
      copyFileSync(packaged, filePath)
    } else {
      const db = openDatabase(filePath)
      seedRetailDatabase(db)
      db.close()
    }
  }
  void closeSession(SAMPLE_CONNECTION_ID)
  return saveConnection({
    id: SAMPLE_CONNECTION_ID,
    name: SAMPLE_CONNECTION_NAME,
    dialect: 'sqlite',
    filePath,
  })
}

/** When the connection list is empty (missing store or zero rows), register the sample DB. */
export function ensureFirstLaunchSample(userData: string): void {
  if (hasConnectionStore() && listConnections().length > 0) return
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

  ipcMain.handle('window:minimize', () => {
    getWindow()?.minimize()
  })
  ipcMain.handle('window:maximize', () => {
    const win = getWindow()
    if (!win) return { maximized: false }
    if (win.isMaximized()) win.unmaximize()
    else win.maximize()
    return { maximized: win.isMaximized() }
  })
  ipcMain.handle('window:close', async () => {
    const win = getWindow()
    if (win && hasAnyOpenTransaction()) {
      const choice = await dialog.showMessageBox(win, {
        type: 'warning',
        buttons: ['取消', '强制关闭'],
        defaultId: 0,
        cancelId: 0,
        title: '未提交的事务',
        message: '仍有连接处于事务中',
        detail: '强制关闭将丢弃未提交的更改。',
      })
      if (choice.response !== 1) return { closed: false }
    }
    win?.close()
    return { closed: true }
  })
  ipcMain.handle('window:isMaximized', () => Boolean(getWindow()?.isMaximized()))

  ipcMain.handle('window:setAlwaysOnTop', (_event, value: boolean) => {
    const next = savePrefs({ alwaysOnTop: value === true })
    getWindow()?.setAlwaysOnTop(next.alwaysOnTop)
    return { alwaysOnTop: next.alwaysOnTop }
  })
  ipcMain.handle('window:isAlwaysOnTop', () => Boolean(getWindow()?.isAlwaysOnTop()))
  ipcMain.handle('window:setZoomFactor', (_event, factor: number) => {
    const next = savePrefs({ zoomFactor: clampZoomFactor(factor) })
    const win = getWindow()
    if (win) win.webContents.setZoomFactor(next.zoomFactor)
    return { zoomFactor: next.zoomFactor }
  })
  ipcMain.handle('window:getZoomFactor', () => {
    const win = getWindow()
    if (win) return win.webContents.getZoomFactor()
    return loadPrefs().zoomFactor
  })

  ipcMain.handle('recent:list', () => listRecentItems())
  ipcMain.handle(
    'recent:recordTable',
    (
      _event,
      input: { connectionId: string; connectionName: string; tableName: string },
    ) => recordRecentTable(input),
  )
  ipcMain.handle(
    'recent:recordQuery',
    (
      _event,
      input: { connectionId: string | null; connectionName: string; sql: string },
    ) => recordRecentQuery(input),
  )
  ipcMain.handle('recent:clear', () => clearRecentItems())
  ipcMain.handle('prefs:get', () => loadPrefs())
  ipcMain.handle('prefs:save', (_event, input: Partial<import('@shared/prefs').AppPrefs>) => {
    const next = savePrefs(input)
    const win = getWindow()
    if (win) {
      if (input.alwaysOnTop !== undefined) win.setAlwaysOnTop(next.alwaysOnTop)
      if (input.zoomFactor !== undefined) win.webContents.setZoomFactor(next.zoomFactor)
    }
    return next
  })

  ipcMain.handle('app:openUserData', async () => {
    const path = userData
    const err = await shell.openPath(path)
    return err ? { ok: false as const, error: err } : { ok: true as const, path }
  })
  ipcMain.handle('app:openLogs', async () => {
    const path = app.getPath('logs')
    const err = await shell.openPath(path)
    return err ? { ok: false as const, error: err } : { ok: true as const, path }
  })

  ipcMain.handle(
    'app:saveTextFile',
    async (
      _event,
      input: { content: string; defaultName?: string; title?: string; path?: string },
    ) => {
      try {
        const direct = input.path?.trim()
        if (direct) {
          writeFileSync(direct, input.content ?? '', 'utf8')
          return { path: direct }
        }
        const win = getWindow()
        const options = {
          title: input.title?.trim() || '保存 SQL',
          defaultPath: input.defaultName?.trim() || 'query.sql',
          filters: [
            { name: 'SQL', extensions: ['sql'] },
            { name: 'All Files', extensions: ['*'] },
          ],
        }
        const result = win
          ? await dialog.showSaveDialog(win, options)
          : await dialog.showSaveDialog(options)
        if (result.canceled || !result.filePath) return { cancelled: true as const }
        writeFileSync(result.filePath, input.content ?? '', 'utf8')
        return { path: result.filePath }
      } catch (error) {
        return { error: error instanceof Error ? error.message : '保存失败' }
      }
    },
  )

  ipcMain.handle('app:openTextFile', async (_event, input?: { title?: string }) => {
    try {
      const win = getWindow()
      const options = {
        title: input?.title?.trim() || '打开 SQL',
        properties: ['openFile'] as Array<'openFile'>,
        filters: [
          { name: 'SQL', extensions: ['sql'] },
          { name: 'Text', extensions: ['txt'] },
          { name: 'All Files', extensions: ['*'] },
        ],
      }
      const result = win
        ? await dialog.showOpenDialog(win, options)
        : await dialog.showOpenDialog(options)
      if (result.canceled || !result.filePaths[0]) return { cancelled: true as const }
      const path = result.filePaths[0]
      const content = readFileSync(path, 'utf8')
      return { path, content }
    } catch (error) {
      return { error: error instanceof Error ? error.message : '打开失败' }
    }
  })

  ipcMain.handle('connections:list', () => listConnections())
  ipcMain.handle('connections:listGroups', () => listConnectionGroups())
  ipcMain.handle(
    'connections:saveGroup',
    (_event, input: { id?: string; name: string; sort?: number }) => saveConnectionGroup(input),
  )
  ipcMain.handle('connections:removeGroup', (_event, id: string) => {
    removeConnectionGroup(id)
  })

  ipcMain.handle('connections:duplicate', (_event, id: string) => {
    const duplicated = duplicateConnection(id)
    if ('error' in duplicated) return duplicated
    return { connection: duplicated.connection }
  })

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

  ipcMain.handle('connections:remove', async (_event, id: string) => {
    if (isInTransaction(id)) {
      try {
        const row = getConnection(id)
        if (row) await rollbackTransaction(targetFromStored(row))
      } catch {
        /* best-effort */
      }
    }
    await closeSession(id)
    removeConnection(id)
    return { ok: true }
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

  ipcMain.handle('connections:health', async (_event, id: string) => {
    const row = getConnection(id)
    if (!row) return { ok: false, latencyMs: 0, error: '连接不存在' }
    try {
      return await pingSession(targetFromStored(row))
    } catch (error) {
      return { ok: false, latencyMs: 0, error: explainDbError(error) }
    }
  })


  ipcMain.handle('connections:listDatabases', async (_event, id: string) => {
    const row = getConnection(id)
    if (!row) return { error: '连接不存在' }
    if (row.dialect === 'sqlite' || row.dialect === 'redis') return { databases: [] as string[] }
    try {
      return { databases: await listInstanceDatabases(targetFromStored(row)) }
    } catch (error) {
      return { error: explainDbError(error) }
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

  ipcMain.handle('connections:export', async () => {
    const bundle = exportConnectionsBundle()
    const win = getWindow()
    const options = {
      title: '导出连接',
      defaultPath: `dataai-connections-${new Date().toISOString().slice(0, 10)}.json`,
      filters: [{ name: 'DataAI Connections', extensions: ['json'] }],
    }
    const result = win ? await dialog.showSaveDialog(win, options) : await dialog.showSaveDialog(options)
    if (result.canceled || !result.filePath) return { path: null, count: 0 }
    writeFileSync(result.filePath, JSON.stringify(bundle, null, 2), 'utf8')
    return { path: result.filePath, count: bundle.connections.length }
  })

  ipcMain.handle('connections:importPreview', async () => {
    const win = getWindow()
    const options = {
      title: '导入连接',
      properties: ['openFile'] as Array<'openFile'>,
      filters: [{ name: 'DataAI Connections', extensions: ['json'] }],
    }
    const picked = win ? await dialog.showOpenDialog(win, options) : await dialog.showOpenDialog(options)
    if (picked.canceled || !picked.filePaths[0]) return { cancelled: true as const }
    const path = picked.filePaths[0]
    try {
      const raw = JSON.parse(readFileSync(path, 'utf8')) as unknown
      const preview = previewConnectionImport(raw)
      if ('error' in preview) return { error: preview.error, path }
      return { path, plan: preview.plan }
    } catch (error) {
      return { error: error instanceof Error ? error.message : '无法读取导入文件', path }
    }
  })

  ipcMain.handle('connections:importApply', (_event, plan: ImportPlanItem[]) => applyConnectionImport(plan))

  ipcMain.handle('connections:importPyQtPreview', async (_event, explicitPath?: string | null) => {
    const preview = previewPyQtImport(explicitPath)
    if ('error' in preview) {
      if (!explicitPath && preview.path && /未找到旧版配置/.test(preview.error)) {
        const win = getWindow()
        const options = {
          title: '选择旧版 DataAI config.db',
          properties: ['openFile'] as Array<'openFile'>,
          filters: [
            { name: 'SQLite', extensions: ['db', 'sqlite', 'sqlite3'] },
            { name: 'All', extensions: ['*'] },
          ],
        }
        const picked = win ? await dialog.showOpenDialog(win, options) : await dialog.showOpenDialog(options)
        if (picked.canceled || !picked.filePaths[0]) return { cancelled: true as const }
        const again = previewPyQtImport(picked.filePaths[0])
        if ('error' in again) return { error: again.error, path: again.path }
        return { path: again.path, plan: again.plan, skipped: again.skipped, found: again.found, source: 'pyqt' as const }
      }
      return { error: preview.error, path: preview.path }
    }
    return { path: preview.path, plan: preview.plan, skipped: preview.skipped, found: preview.found, source: 'pyqt' as const }
  })

  ipcMain.handle(
    'sql:execute',
    async (
      _event,
      payload: { connectionId: string; sql: string; requestId?: string; timeoutMs?: number; database?: string },
    ) => {
    const row = getConnection(payload.connectionId)
    if (!row) return { error: '连接不存在' }
    if (!dialectInfo(row.dialect).executable) return { error: '这个类型还不能查询。连接已保存在本机。' }
    try {
      const prefs = loadPrefs()
      const timeoutMs =
        payload.timeoutMs !== undefined
          ? payload.timeoutMs
          : prefs.queryTimeoutSec > 0
            ? prefs.queryTimeoutSec * 1000
            : 0
      const results = await executeSession(targetFromStored(row), payload.sql, {
        requestId: payload.requestId,
        timeoutMs,
        database: payload.database,
      })
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

  ipcMain.handle(
    'sql:tableStructure',
    async (_event, payload: { connectionId: string; table: string; databaseName?: string }) => {
      const row = getConnection(payload.connectionId)
      if (!row) return { error: '连接不存在' }
      if (!dialectInfo(row.dialect).executable) return { error: '这个类型还不能查看表结构' }
      try {
        const structure = await inspectTableSession(
          targetFromStored(row),
          payload.table,
          payload.databaseName,
        )
        return { structure }
      } catch (error) {
        return { error: explainDbError(error) }
      }
    },
  )

    
  ipcMain.handle('sql:importPick', async () => {
    const win = getWindow()
    const options = {
      title: '导入 CSV / Excel',
      properties: ['openFile'] as Array<'openFile'>,
      filters: [
        { name: '表格文件', extensions: ['csv', 'txt', 'xlsx'] },
        { name: 'CSV', extensions: ['csv', 'txt'] },
        { name: 'Excel', extensions: ['xlsx'] },
      ],
    }
    const result = win ? await dialog.showOpenDialog(win, options) : await dialog.showOpenDialog(options)
    if (result.canceled || !result.filePaths[0]) return { cancelled: true as const }
    return { path: result.filePaths[0] }
  })

  ipcMain.handle('sql:importRead', async (_event, filePath: string) => {
    if (!filePath || typeof filePath !== 'string') return { error: '无效文件路径' }
    try {
      const data = await readImportFile(filePath)
      return { data }
    } catch (error) {
      return { error: explainDbError(error) }
    }
  })


  ipcMain.handle('sql:txnStatus', (_event, connectionId: string) => {
    const row = getConnection(connectionId)
    if (!row) return { open: false, supported: false }
    return transactionStatus(targetFromStored(row))
  })

  ipcMain.handle('sql:beginTxn', async (_event, connectionId: string) => {
    const row = getConnection(connectionId)
    if (!row) return { error: '连接不存在' }
    if (!dialectInfo(row.dialect).executable) return { error: '这个类型还不支持事务' }
    try {
      const status = await beginTransaction(targetFromStored(row))
      return { status }
    } catch (error) {
      return { error: explainDbError(error) }
    }
  })

  ipcMain.handle('sql:commitTxn', async (_event, connectionId: string) => {
    const row = getConnection(connectionId)
    if (!row) return { error: '连接不存在' }
    try {
      const status = await commitTransaction(targetFromStored(row))
      return { status }
    } catch (error) {
      return { error: explainDbError(error) }
    }
  })

  ipcMain.handle('sql:rollbackTxn', async (_event, connectionId: string) => {
    const row = getConnection(connectionId)
    if (!row) return { error: '连接不存在' }
    try {
      const status = await rollbackTransaction(targetFromStored(row))
      return { status }
    } catch (error) {
      return { error: explainDbError(error) }
    }
  })

ipcMain.handle('sql:cancel', async (_event, requestId: string) => {
    if (!requestId || typeof requestId !== 'string') return { ok: false }
    return cancelQuery(requestId)
  })

  ipcMain.handle('sql:explain', async (_event, payload: { connectionId: string; sql: string; requestId?: string; timeoutMs?: number }) => {
    const row = getConnection(payload.connectionId)
    if (!row) return { error: '连接不存在' }
    if (!dialectInfo(row.dialect).executable) return { error: '这个类型还不能查询执行计划' }
    const built = buildExplainSql(row.dialect, payload.sql)
    if (!built.ok) return { error: built.error }
    try {
      const prefs = loadPrefs()
      const timeoutMs =
        payload.timeoutMs !== undefined
          ? payload.timeoutMs
          : prefs.queryTimeoutSec > 0
            ? prefs.queryTimeoutSec * 1000
            : 0
      return { results: await executeSession(targetFromStored(row), built.sql, {
        requestId: payload.requestId,
        timeoutMs,
      }) }
    } catch (error) {
      return { error: explainDbError(error) }
    }
  })

  ipcMain.handle('history:list', (_event, connectionId: string) => listQueryHistory(connectionId))
  ipcMain.handle('history:clear', (_event, connectionId: string) => {
    clearQueryHistory(connectionId)
  })
  ipcMain.handle('history:remove', (_event, payload: { connectionId: string; entryId: string }) => {
    removeQueryHistoryEntry(payload.connectionId, payload.entryId)
  })

  ipcMain.handle('favorites:list', () => listFavorites())
  ipcMain.handle(
    'favorites:save',
    (
      _event,
      input: { id?: string; name: string; sql: string; connectionId?: string | null },
    ) => saveFavorite(input),
  )
  ipcMain.handle('favorites:remove', (_event, id: string) => {
    removeFavorite(id)
  })

  ipcMain.handle('favorites:listFolders', () => listFavoriteFolders())
  ipcMain.handle(
    'favorites:saveFolder',
    (_event, input: { id?: string; name: string }) => saveFavoriteFolder(input),
  )
  ipcMain.handle('favorites:removeFolder', (_event, id: string) => {
    removeFavoriteFolder(id)
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
      if (controller.signal.aborted || (error instanceof Error && error.name === 'AbortError')) {
        send({ requestId: payload.requestId, type: 'done', mode: 'preview', cancelled: true })
        return
      }
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
  ipcMain.handle('workspace:loadSchemaCache', () => loadSchemaCache())
  ipcMain.handle('workspace:saveSchemaCache', (_event, nodes: SchemaNode[]) => {
    saveSchemaCache(nodes)
  })
  ipcMain.handle('workspace:save', (_event, state: WorkspaceState) => {
    saveWorkspace(state)
  })
}

export function closeAllHandles(): void {
  void closeAllSessions()
  for (const controller of aborts.values()) controller.abort()
  aborts.clear()
}
