import { existsSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { app, BrowserWindow, Menu, shell } from 'electron'
import { INITIAL_TABS } from '@shared/session'
import { closeAllHandles, ensureFirstLaunchSample, registerIpc } from './ipc'
import { seedRetailDatabase } from './sampleDb'
import { executeScript, openDatabase } from './sqlite'

const isDev = !app.isPackaged

function iconPath(): string | undefined {
  const candidates = [
    join(process.cwd(), '../../resources/icons/app_icon.png'),
    join(app.getAppPath(), '../../../resources/icons/app_icon.png'),
  ]
  return candidates.find((path) => existsSync(path))
}

function createWindow(): BrowserWindow {
  const win = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 1100,
    minHeight: 720,
    show: false,
    frame: false,
    transparent: false,
    backgroundColor: '#0c0e13',
    title: 'DataAI',
    icon: iconPath(),
    autoHideMenuBar: true,
    webPreferences: {
      preload: join(__dirname, '../preload/index.mjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  })

  win.once('ready-to-show', () => win.show())
  win.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url)
    return { action: 'deny' }
  })

  if (isDev && process.env.ELECTRON_RENDERER_URL) {
    void win.loadURL(process.env.ELECTRON_RENDERER_URL)
  } else {
    void win.loadFile(join(__dirname, '../renderer/index.html'))
  }
  return win
}

function runSmoke(): void {
  const dir = mkdtempSync(join(tmpdir(), 'dataai-smoke-'))
  try {
    const db = openDatabase(join(dir, 'retail.db'))
    seedRetailDatabase(db)
    const overview = INITIAL_TABS.find((tab) => tab.title === '客户总览')
    const rows = executeScript(db, overview?.sql ?? '')
    if (!rows[0]?.ok || !rows[0].columns?.includes('客户') || (rows[0].rows?.length ?? 0) < 8) {
      throw new Error('客户总览没有返回预期的行')
    }
    const multi = INITIAL_TABS.find((tab) => tab.title === '区域、状态与品类汇总')
    const grids = executeScript(db, multi?.sql ?? '').filter((result) => result.ok && result.columns)
    if (grids.length !== 3) throw new Error(`汇总查询应返回 3 个结果，实际 ${grids.length}`)
    const failed = executeScript(db, "SELECT no_such_column FROM customers; SELECT 1 AS ok;")
    if (failed[0]?.ok || failed.length !== 1) throw new Error('失败语句应该停止后续执行')
    const quoted = executeScript(db, "SELECT 'a;b' AS 文本;")
    if (quoted[0]?.rows?.[0]?.['文本'] !== 'a;b') throw new Error('字符串中的分号被错误拆开')
    db.close()
    console.log('dataai smoke ok')
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
}

let mainWindow: BrowserWindow | null = null

app.setName('DataAI')
Menu.setApplicationMenu(null)

app.whenReady().then(() => {
  if (process.argv.includes('--smoke')) {
    try {
      runSmoke()
      app.exit(0)
    } catch (error) {
      console.error(error)
      app.exit(1)
    }
    return
  }

  ensureFirstLaunchSample(app.getPath('userData'))
  registerIpc(() => mainWindow, app.getPath('userData'))
  mainWindow = createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) mainWindow = createWindow()
  })
})

app.on('window-all-closed', () => {
  closeAllHandles()
  if (process.platform !== 'darwin') app.quit()
})

app.on('before-quit', () => {
  closeAllHandles()
})
