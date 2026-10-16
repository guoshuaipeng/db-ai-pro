import { QUERY_TEMPLATES, templateCommandId } from './queryTemplates'
export type CommandCategory = 'query' | 'view' | 'connection' | 'ai' | 'help'

export type CommandDef = {
  id: string
  title: string
  subtitle?: string
  keywords?: string
  shortcut?: string
  category: CommandCategory
}

export const COMMAND_CATALOG: CommandDef[] = [
  {
    id: 'query.new',
    title: '新建查询标签',
    subtitle: '打开空白 SQL 标签页',
    keywords: 'new tab query sql',
    shortcut: 'Ctrl+T',
    category: 'query',
  },
  {
    id: 'query.duplicate',
    title: '复制当前查询标签',
    subtitle: '复制 SQL 与连接，打开为新标签',
    keywords: 'duplicate copy tab clone',
    shortcut: 'Ctrl+Shift+D',
    category: 'query',
  },
  {
    id: 'query.reopenClosed',
    title: '重新打开已关闭标签',
    subtitle: '恢复最近关闭的查询（仅本会话）',
    keywords: 'reopen closed tab undo close',
    shortcut: 'Ctrl+Shift+T',
    category: 'query',
  },
  {
    id: 'query.run',
    title: '运行当前 SQL',
    subtitle: '执行编辑器中的语句',
    keywords: 'run execute f5',
    shortcut: 'Ctrl+Enter',
    category: 'query',
  },
  {
    id: 'query.explain',
    title: '查看执行计划',
    subtitle: 'EXPLAIN / SHOWPLAN',
    keywords: 'explain plan analyze',
    shortcut: 'Ctrl+Shift+E',
    category: 'query',
  },
  {
    id: 'query.favorites',
    title: '打开收藏片段',
    subtitle: '插入已保存的 SQL',
    keywords: 'favorites snippets star',
    category: 'query',
  },
  {
    id: 'query.history',
    title: '打开查询历史',
    subtitle: '重跑最近执行的语句',
    keywords: 'history recent',
    category: 'query',
  },
  {
    id: 'query.beginTxn',
    title: '开始事务',
    subtitle: 'BEGIN · 关闭自动提交',
    keywords: 'begin transaction txn 事务',
    category: 'query',
  },
  {
    id: 'query.commitTxn',
    title: '提交事务',
    subtitle: 'COMMIT',
    keywords: 'commit transaction txn 提交',
    category: 'query',
  },
  {
    id: 'query.rollbackTxn',
    title: '回滚事务',
    subtitle: 'ROLLBACK',
    keywords: 'rollback transaction txn 回滚',
    category: 'query',
  },
  {
    id: 'query.format',
    title: '格式化 SQL',
    subtitle: '美化当前编辑器 / 选区',
    keywords: 'format pretty beautify indent 格式化',
    shortcut: 'Shift+Alt+F',
    category: 'query',
  },
  {
    id: 'editor.toggleComment',
    title: '切换行注释',
    subtitle: 'SQL -- 注释 / 取消注释',
    keywords: 'comment 注释 toggle',
    shortcut: 'Ctrl+/',
    category: 'query',
  },
  {
    id: 'editor.find',
    title: '在编辑器中查找',
    subtitle: 'Monaco 查找',
    keywords: 'find search 查找',
    shortcut: 'Ctrl+F',
    category: 'query',
  },
  {
    id: 'editor.replace',
    title: '在编辑器中替换',
    subtitle: 'Monaco 查找替换',
    keywords: 'replace 替换',
    shortcut: 'Ctrl+H',
    category: 'query',
  },
  {
    id: 'schema.diff',
    title: '表结构对比',
    subtitle: '列级 Schema Diff · 建议 ALTER',
    keywords: 'schema diff compare alter 对比 差异',
    category: 'query',
  },
  {
    id: 'view.focusSearch',
    title: '聚焦对象树搜索',
    subtitle: '过滤连接 / 表 / 列',
    keywords: 'search tree filter host',
    shortcut: 'Ctrl+Shift+F',
    category: 'view',
  },
  {
    id: 'view.focusEditor',
    title: '聚焦 SQL 编辑器',
    keywords: 'editor monaco focus',
    shortcut: 'Ctrl+Shift+1',
    category: 'view',
  },
  {
    id: 'view.toggleSidebar',
    title: '显示/隐藏连接栏',
    keywords: 'sidebar connections',
    shortcut: 'Ctrl+B',
    category: 'view',
  },
  {
    id: 'view.toggleAi',
    title: '显示/隐藏助手',
    keywords: 'assistant ai pane',
    shortcut: 'Ctrl+Shift+A',
    category: 'view',
  },
  {
    id: 'connection.health',
    title: '检测当前连接延迟',
    subtitle: 'SELECT 1 / PING',
    keywords: 'ping health latency 延迟 探测',
    category: 'connection',
  },
  {
    id: 'connection.healthAll',
    title: '检测全部连接延迟',
    keywords: 'ping health all 延迟',
    category: 'connection',
  },
  {
    id: 'connection.new',
    title: '新建连接',
    keywords: 'new connection database',
    category: 'connection',
  },
  {
    id: 'connection.export',
    title: '导出连接',
    subtitle: 'JSON（仅密封密文）',
    keywords: 'export backup',
    category: 'connection',
  },
  {
    id: 'connection.import',
    title: '导入连接',
    subtitle: '合并 / 覆盖 / 跳过',
    keywords: 'import restore',
    category: 'connection',
  },
  {
    id: 'ai.settings',
    title: '打开设置',
    subtitle: '模型 / 外观 / 关于',
    keywords: 'settings openai key about preference',
    category: 'ai',
  },
  {
    id: 'help.about',
    title: '关于 DataAI',
    subtitle: '版本与工作区目录',
    keywords: 'about version',
    category: 'help',
  },
  {
    id: 'ai.clear',
    title: '清空助手会话',
    keywords: 'clear memory chat',
    category: 'ai',
  },
  {
    id: 'safe.globalReadOnly',
    title: '切换全局只读',
    subtitle: '拦截写入 / DDL；SELECT 仍可用',
    keywords: 'readonly safe 只读 安全',
    category: 'connection',
  },
  {
    id: 'safe.connectionReadOnly',
    title: '切换当前连接只读',
    subtitle: '仅影响活动连接',
    keywords: 'readonly connection 只读 连接',
    category: 'connection',
  },
  {
    id: 'view.toggleMinimap',
    title: '切换编辑器小地图',
    subtitle: 'Monaco minimap 开 / 关',
    keywords: 'minimap map 小地图 缩略',
    category: 'view',
  },
  {
    id: 'view.editorFont',
    title: '编辑器字号…',
    subtitle: '在设置中调节 12–20',
    keywords: 'font size 字号 字体 monaco',
    category: 'view',
  },
  {
    id: 'view.alwaysOnTop',
    title: '切换窗口置顶',
    subtitle: '始终显示在其他窗口之上',
    keywords: 'pin always on top 置顶 钉住',
    category: 'view',
  },
  {
    id: 'view.zoomIn',
    title: '放大界面',
    subtitle: '提高缩放比例',
    keywords: 'zoom in 放大',
    shortcut: 'Ctrl+=',
    category: 'view',
  },
  {
    id: 'view.zoomOut',
    title: '缩小界面',
    subtitle: '降低缩放比例',
    keywords: 'zoom out 缩小',
    shortcut: 'Ctrl+-',
    category: 'view',
  },
  {
    id: 'view.zoomReset',
    title: '重置缩放',
    subtitle: '恢复 100%',
    keywords: 'zoom reset 100 重置',
    shortcut: 'Ctrl+0',
    category: 'view',
  },
  {
    id: 'help.shortcuts',
    title: '键盘快捷键',
    subtitle: '查看常用快捷键',
    keywords: 'shortcuts keymap help',
    shortcut: 'F1',
    category: 'help',
  },
  {
    id: 'help.palette',
    title: '命令面板',
    keywords: 'command palette',
    shortcut: 'Ctrl+K',
    category: 'help',
  },
  {
    id: 'query.templates',
    title: '快速查询模板…',
    subtitle: '打开编辑器模板菜单',
    keywords: 'template 模板 snippet quick',
    category: 'query',
  },
  ...QUERY_TEMPLATES.map(
    (tpl): CommandDef => ({
      id: templateCommandId(tpl.id),
      title: `模板：${tpl.title}`,
      subtitle: tpl.subtitle,
      keywords: `template 模板 ${tpl.keywords}`,
      category: 'query',
    }),
  ),
]

/** Case-insensitive subsequence / substring score. Higher is better; null = no match. */
export function fuzzyScore(query: string, ...fields: string[]): number | null {
  const needle = query.trim().toLowerCase()
  if (!needle) return 0
  const haystack = fields.filter(Boolean).join(' ').toLowerCase()
  if (!haystack) return null
  if (haystack === needle) return 10_000
  const idx = haystack.indexOf(needle)
  if (idx >= 0) return 5_000 - idx * 10 + Math.min(haystack.length, 200)

  let score = 0
  let from = 0
  for (const ch of needle) {
    const at = haystack.indexOf(ch, from)
    if (at < 0) return null
    score += 20 - Math.min(at - from, 15)
    from = at + 1
  }
  return score
}

export function filterCommands(query: string, catalog: CommandDef[] = COMMAND_CATALOG): CommandDef[] {
  const ranked = catalog
    .map((command) => {
      const score = fuzzyScore(query, command.title, command.subtitle ?? '', command.keywords ?? '', command.id)
      return score === null ? null : { command, score }
    })
    .filter((row): row is { command: CommandDef; score: number } => row !== null)

  ranked.sort((a, b) => b.score - a.score || a.command.title.localeCompare(b.command.title, 'zh-CN'))
  return ranked.map((row) => row.command)
}

export const SHORTCUT_HELP: { action: string; keys: string }[] = [
  { action: '命令 / 对象搜索', keys: 'Ctrl+K · Ctrl+P' },
  { action: '运行 SQL', keys: 'Ctrl+Enter · F5' },
  { action: '执行计划', keys: 'Ctrl+Shift+E' },
  { action: '格式化 SQL', keys: 'Shift+Alt+F' },
  { action: '切换行注释', keys: 'Ctrl+/' },
  { action: '多光标（Monaco 内置）', keys: 'Alt+单击 · Ctrl+Alt+↑/↓' },
  { action: '查找', keys: 'Ctrl+F' },
  { action: '替换', keys: 'Ctrl+H' },
  { action: '新建查询', keys: 'Ctrl+T' },
  { action: '关闭标签', keys: 'Ctrl+W' },
  { action: '连接栏', keys: 'Ctrl+B' },
  { action: '助手面板', keys: 'Ctrl+Shift+A' },
  { action: '对象树搜索', keys: 'Ctrl+Shift+F' },
  { action: '聚焦编辑器', keys: 'Ctrl+Shift+1' },
  { action: '快捷键说明', keys: 'F1' },
  { action: '收藏片段变量 {{table}} / {{limit}}', keys: '插入时填写' },
  { action: '最近表 / 最近查询', keys: '标题栏「最近」· Ctrl+K' },
  { action: '全局搜索表 / 列 / 收藏', keys: 'Ctrl+K · Ctrl+P 输入关键字' },
  { action: '只读 / 安全模式', keys: '设置 · Ctrl+K「只读」' },
  { action: '窗口置顶', keys: '标题栏「置顶」· Ctrl+K' },
  { action: '放大 / 缩小 / 重置缩放', keys: 'Ctrl+= · Ctrl+- · Ctrl+0' },
  { action: '编辑器小地图', keys: '设置 · Ctrl+K「小地图」' },
  { action: '编辑器字号', keys: '设置 → 外观' },
  { action: '快速查询模板', keys: '工具栏「模板」· Ctrl+K' },
  { action: '插入表名 / 列名', keys: '对象树菜单 · Alt/Ctrl+单击' },
  { action: '未保存标签关闭确认', keys: '关闭脏标签 / 关窗时提示' },
  { action: '固定查询标签', keys: '标签右键 · 固定/取消固定' },
  { action: '重命名查询标签', keys: '右键 / 双击 / F2' },
  { action: '复制查询标签', keys: 'Ctrl+Shift+D · 右键' },
  { action: '重新打开已关闭标签', keys: 'Ctrl+Shift+T' },
]
