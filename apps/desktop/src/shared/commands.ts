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
    subtitle: '执行编辑器中的语句（含 {{name}} 时先填参数）',
    keywords: 'run execute f5',
    shortcut: 'Ctrl+Enter',
    category: 'query',
  },
  {
    id: 'query.cancel',
    title: '取消正在执行的查询',
    subtitle: '停止当前 SQL（有弹层时 Esc 仍关闭弹层）',
    keywords: 'cancel stop abort 取消 停止 esc',
    shortcut: 'Esc（执行中）',
    category: 'query',
  },
  {
    id: 'query.fillParams',
    title: '填写查询参数',
    subtitle: '为当前 SQL 的 {{name}} 占位符赋值',
    keywords: 'params variables 参数 占位符 填写',
    shortcut: '工具栏「填写参数」',
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
    id: 'query.saveFavorite',
    title: '收藏当前 SQL',
    subtitle: '将编辑器内容保存为片段（可全局或按连接）',
    keywords: 'favorite bookmark 收藏 片段 保存 save',
    shortcut: 'Ctrl+Shift+S',
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
    id: 'query.slowHistory',
    title: '慢查询历史',
    subtitle: '仅显示超过阈值的执行记录',
    keywords: 'slow query history 慢查询 历史',
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
    id: 'query.saveToFile',
    title: '保存 SQL 到文件',
    subtitle: '将当前标签写入 .sql（Ctrl+S）',
    keywords: 'save file export sql 保存 文件',
    shortcut: 'Ctrl+S',
    category: 'query',
  },
  {
    id: 'query.openFromFile',
    title: '从文件打开 SQL',
    subtitle: '打开 .sql 到新标签（Ctrl+O）',
    keywords: 'open file import sql 打开 文件',
    shortcut: 'Ctrl+O',
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
    id: 'editor.gotoLine',
    title: '转到行',
    subtitle: '跳转到指定行 / 列（状态栏行号也可点）',
    keywords: 'goto line column jump 转到 行号 跳转',
    shortcut: 'Ctrl+G',
    category: 'query',
  },
  {
    id: 'result.find',
    title: '在结果中查找',
    subtitle: '高亮匹配单元格并定位',
    keywords: 'result find search grid 结果 查找',
    shortcut: '结果区 Ctrl+F',
    category: 'query',
  },
  {
    id: 'result.autofitColumns',
    title: '列宽适应',
    subtitle: '按表头与采样行估算结果列宽',
    keywords: 'autofit column width 列宽 适应 结果表格',
    shortcut: '工具栏「列宽适应」',
    category: 'query',
  },
  {
    id: 'result.copyHeaders',
    title: '复制结果列名',
    subtitle: '表头写入剪贴板（制表符分隔）',
    keywords: 'headers columns copy 列名 表头 复制 结果',
    shortcut: '结果工具栏「复制列名」',
    category: 'query',
  },
  {
    id: 'result.copyMarkdown',
    title: '复制结果为 Markdown',
    subtitle: 'GFM 表格写入剪贴板（可粘贴到文档 / 聊天）',
    keywords: 'markdown md copy table 复制 表格 文档',
    shortcut: '结果工具栏「复制 MD」',
    category: 'query',
  },
  {
    id: 'result.copyMessage',
    title: '复制结果输出',
    subtitle: '消息 / 执行计划文本写入剪贴板',
    keywords: 'copy message plan explain output 复制 输出 计划 错误',
    shortcut: '结果工具栏「复制输出」',
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
    id: 'view.focusResult',
    title: '聚焦结果区',
    subtitle: '表格 / 输出 / 执行计划',
    keywords: 'result grid focus 结果 表格',
    shortcut: 'Ctrl+Shift+2',
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
    id: 'connection.duplicate',
    title: '复制当前连接',
    subtitle: '克隆连接配置（含已保存密码），名称加「副本」',
    keywords: 'duplicate clone copy connection 复制 连接 副本',
    category: 'connection',
  },
  {
    id: 'connection.copyEndpoint',
    title: '复制连接地址',
    subtitle: '主机:端口 / SQLite 路径（不含密码）',
    keywords: 'endpoint host port url address 地址 主机 复制',
    category: 'connection',
  },
  {
    id: 'connection.revealInTree',
    title: '在对象树中显示连接',
    subtitle: '打开侧栏并滚动到当前连接（状态栏 Ctrl+单击）',
    keywords: 'reveal tree navigate locate 对象树 显示 定位 连接',
    shortcut: '状态栏 Ctrl+单击',
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
    shortcut: '状态栏「只读/可写」',
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
    id: 'view.toggleWordWrap',
    title: '切换自动换行',
    subtitle: 'SQL 编辑器软换行开 / 关',
    keywords: 'word wrap 换行 自动换行 softwrap',
    shortcut: 'Alt+Z · 状态栏',
    category: 'view',
  },
  {
    id: 'view.toggleBracketColorization',
    title: '切换括号配对着色',
    subtitle: '彩色括号与配对引导线',
    keywords: 'bracket colorization 括号 配对 着色 guide',
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
  { action: '运行 SQL（有选区则只跑选区）', keys: 'Ctrl+Enter · F5' },
  { action: '多语句条数', keys: '状态栏「N 条语句」（≥2 条时显示）' },
  { action: '编辑器选区统计', keys: '状态栏「已选 N 字符 / 行」（有选区时）' },
  { action: '再次运行 / 再次查看计划', keys: '状态栏结果摘要（点击）' },
  { action: '收藏当前 SQL', keys: 'Ctrl+Shift+S · 工具栏「收藏」' },
  { action: '执行计划', keys: 'Ctrl+Shift+E' },
  { action: '格式化 SQL', keys: 'Shift+Alt+F' },
  { action: '切换行注释', keys: 'Ctrl+/' },
  { action: '多光标（Monaco 内置）', keys: 'Alt+单击 · Ctrl+Alt+↑/↓' },
  { action: '查找', keys: 'Ctrl+F' },
  { action: '替换', keys: 'Ctrl+H' },
  { action: '新建查询', keys: 'Ctrl+T' },
  { action: '新建查询（标签栏）', keys: '双击标签栏空白处' },
  { action: '保存 SQL 到文件', keys: 'Ctrl+S' },
  { action: '从文件打开 SQL', keys: 'Ctrl+O' },
  { action: '拖入 .sql 文件打开', keys: '拖到编辑器（可多选）' },
  { action: '关闭标签', keys: 'Ctrl+W' },
  { action: '连接栏', keys: 'Ctrl+B' },
  { action: '助手面板', keys: 'Ctrl+Shift+A' },
  { action: '对象树搜索', keys: 'Ctrl+Shift+F' },
  { action: '聚焦编辑器', keys: 'Ctrl+Shift+1' },
  { action: '快捷键说明', keys: 'F1' },
  { action: '收藏片段变量 {{table}} / {{limit}}', keys: '插入时填写' },
  { action: '最近表 / 最近查询', keys: '标题栏「最近」· Ctrl+K' },
  { action: '全局搜索表 / 列 / 收藏', keys: 'Ctrl+K · Ctrl+P 输入关键字' },
  { action: '只读 / 安全模式', keys: '状态栏「只读/可写」· 设置 · Ctrl+K「只读」' },
  { action: '窗口置顶', keys: '标题栏「置顶」· Ctrl+K' },
  { action: '放大 / 缩小 / 重置缩放', keys: 'Ctrl+= · Ctrl+- · Ctrl+0' },
  { action: '编辑器小地图', keys: '设置 · Ctrl+K「小地图」' },
  { action: '自动换行', keys: 'Alt+Z · 工具栏「换行」· 状态栏「换行」' },
  { action: '编辑器字号', keys: '设置 → 外观' },
  { action: '快速查询模板', keys: '工具栏「模板」· Ctrl+K' },
  { action: '插入表名 / 列名', keys: '对象树菜单 · Alt/Ctrl+单击' },
  { action: '复制表名 / 列名 / 库名', keys: '对象树菜单「复制…」' },
  { action: '复制连接', keys: '对象树菜单「复制连接」· Ctrl+K' },
  { action: '复制连接地址', keys: '对象树菜单「复制地址」· Ctrl+K' },
  { action: '在对象树中显示连接', keys: '状态栏 Ctrl+单击 · Ctrl+K' },
  { action: '标题栏定位连接', keys: '单击标题栏路径（面包屑）' },
  { action: '未保存标签关闭确认', keys: '关闭脏标签 / 关窗时提示' },
  { action: '固定查询标签', keys: '标签右键 · 固定/取消固定' },
  { action: '重命名查询标签', keys: '右键 / 双击 / F2' },
  { action: '复制查询标签', keys: 'Ctrl+Shift+D · 右键' },
  { action: '重新打开已关闭标签', keys: 'Ctrl+Shift+T' },
  { action: '拖拽调整标签顺序', keys: '标签栏拖拽（固定组内/未固定组内）' },
  { action: '在结果中查找', keys: '结果区 Ctrl+F · 工具栏「查找」' },
  { action: '复制结果列名', keys: '结果工具栏「复制列名」· Ctrl+K' },
  { action: '列宽适应', keys: '工具栏「列宽适应」· Ctrl+K · 表头分隔线双击' },
  { action: '结果列筛选', keys: '表头「筛」· 右键「列筛选…」' },
  { action: '导出列选择', keys: '导出 CSV/JSON/MD/HTML/Excel 前勾选列' },
  { action: 'CSV UTF-8 BOM', keys: '导出/复制 CSV 默认带 BOM，Excel 中文不乱码' },
  { action: 'NULL 与空字符串', keys: '结果格 NULL / "" 区分显示' },
  { action: '显示 / 隐藏结果列', keys: '工具栏「显示列」· 右键「隐藏此列」' },
  { action: '单元格全文预览', keys: '双击单元格 · 工具栏「查看单元格」' },
  { action: '填写查询参数', keys: '工具栏「填写参数」· Ctrl+K · 运行时自动' },
  { action: '查询标签连接色', keys: '连接颜色标记 → 标签左侧色条' },
  { action: '括号配对着色', keys: '设置 → 外观 · Ctrl+K「括号」' },
  { action: '慢查询历史', keys: '历史面板「仅慢查询」· Ctrl+K' },
  { action: '结果摘要条', keys: '结果区标签下方自动显示' },
  { action: '拖拽插入 SQL', keys: '收藏/历史/对象树 → 拖到编辑器' },
  { action: '刷新对象树', keys: '侧栏刷新 · 连接/库/表菜单「刷新」' },
]
