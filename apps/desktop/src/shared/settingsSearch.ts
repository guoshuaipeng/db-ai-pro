/** Settings center search / filter helpers (M125). */

export type SettingsTabId = 'model' | 'appearance' | 'query' | 'about'

export type SettingsSearchItem = {
  id: string
  tab: SettingsTabId
  title: string
  /** Extra Chinese / English tokens for matching. */
  keywords: string
}

/** Catalog of searchable settings rows (appearance + query + model group + about). */
export const SETTINGS_SEARCH_ITEMS: readonly SettingsSearchItem[] = [
  {
    id: 'density',
    tab: 'appearance',
    title: '界面密度',
    keywords: '舒适 紧凑 comfortable compact 间距 留白',
  },
  {
    id: 'highContrast',
    tab: 'appearance',
    title: '高对比度',
    keywords: '对比度 边框 焦点 投影 弱光 accessibility',
  },
  {
    id: 'restoreTabsOnLaunch',
    tab: 'appearance',
    title: '启动时恢复标签',
    keywords: '标签 恢复 启动 会话 tabs restore',
  },
  {
    id: 'globalReadOnly',
    tab: 'appearance',
    title: '全局只读',
    keywords: '只读 安全 拦截 写入 DDL readonly safe',
  },
  {
    id: 'alwaysOnTop',
    tab: 'appearance',
    title: '窗口置顶',
    keywords: '置顶 窗口 always on top',
  },
  {
    id: 'notifyOnErrorOnly',
    tab: 'appearance',
    title: '通知：仅错误',
    keywords: '通知 错误 警告 notification error',
  },
  {
    id: 'notifyOnSlowQuery',
    tab: 'appearance',
    title: '通知：慢查询',
    keywords: '通知 慢查询 slow notification',
  },
  {
    id: 'editorMinimap',
    tab: 'appearance',
    title: '编辑器小地图',
    keywords: '小地图 minimap Monaco 缩略图',
  },
  {
    id: 'editorWordWrap',
    tab: 'appearance',
    title: '自动换行',
    keywords: '换行 word wrap 软换行',
  },
  {
    id: 'editorBracketColorization',
    tab: 'appearance',
    title: '括号配对着色',
    keywords: '括号 配对 彩色 bracket colorization',
  },
  {
    id: 'editorFontSize',
    tab: 'appearance',
    title: '编辑器字号',
    keywords: '字号 字体 大小 font size',
  },
  {
    id: 'zoom',
    tab: 'appearance',
    title: '界面缩放',
    keywords: '缩放 zoom 放大 缩小 百分比 Ctrl+0',
  },
  {
    id: 'welcomeDismissed',
    tab: 'appearance',
    title: '无连接时显示欢迎页',
    keywords: '欢迎 引导 onboarding welcome 示例库',
  },
  {
    id: 'queryTimeoutSec',
    tab: 'query',
    title: '软超时',
    keywords: '超时 秒 timeout 取消 查询 Esc 软超时 不限制 预设',
  },
  {
    id: 'slowQueryMs',
    tab: 'query',
    title: '慢查询阈值',
    keywords: '慢查询 毫秒 阈值 slow ms',
  },
  {
    id: 'model',
    tab: 'model',
    title: '模型与密钥',
    keywords: '模型 API Key 接口 密钥 OpenAI baseUrl DeepSeek Ollama 预览 清除密钥',
  },
  {
    id: 'about',
    tab: 'about',
    title: '关于 DataAI',
    keywords: '关于 版本 更新 诊断 密钥环 工作区 日志 CHANGELOG 复制版本 许可 MIT',
  },
]

function haystack(item: SettingsSearchItem): string {
  return (item.title + ' ' + item.keywords).toLowerCase()
}

/** Case-insensitive match on title / keywords; empty query returns all. */
export function filterSettingsItems(
  items: readonly SettingsSearchItem[],
  query: string,
): SettingsSearchItem[] {
  const q = query.trim().toLowerCase()
  if (!q) return items.slice()
  return items.filter((item) => haystack(item).includes(q))
}

/** Ids visible for a tab given the current query. Empty query → all ids on that tab. */
export function visibleSettingIdsForTab(
  tab: SettingsTabId,
  query: string,
  items: readonly SettingsSearchItem[] = SETTINGS_SEARCH_ITEMS,
): Set<string> {
  const scoped = items.filter((item) => item.tab === tab)
  return new Set(filterSettingsItems(scoped, query).map((item) => item.id))
}

export function tabHasSettingsMatch(
  tab: SettingsTabId,
  query: string,
  items: readonly SettingsSearchItem[] = SETTINGS_SEARCH_ITEMS,
): boolean {
  if (!query.trim()) return true
  return filterSettingsItems(
    items.filter((item) => item.tab === tab),
    query,
  ).length > 0
}

export function settingsSearchEmptyBody(): string {
  return '没有匹配的设置项。试试更短的关键字，或清除筛选后浏览全部。'
}

export function settingsSearchMatchCountLabel(matched: number, total: number): string {
  return matched + '/' + total
}
