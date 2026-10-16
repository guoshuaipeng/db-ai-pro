/** Short in-app release highlights (Chinese). Full text lives in CHANGELOG.md. */

export const APP_VERSION_LABEL = '3.100.0'

export const RELEASE_NOTES_SNIPPET: { title: string; items: string[] } = {
  title: '近期更新',
  items: [
    '表浏览分页；结构 / DDL 筛选、计数与空状态',
    '导入向导：空状态、列映射摘要、按名称重映射与全部跳过',
    '模型设置：就绪状态、常用接口 / 模型、校验与清除密钥',
    '查询错误面板、EXPLAIN、结果摘要等高频 SQL 流程打磨',
    '完整说明见仓库 apps/desktop/CHANGELOG.md',
  ],
}

export type AboutDiagnosticsInput = {
  version: string
  encryption?: 'os' | 'unavailable'
  mode?: 'desktop' | 'preview'
}

export function releaseNotesTitle(version: string): string {
  const v = version.trim() || APP_VERSION_LABEL
  return `${v} · ${RELEASE_NOTES_SNIPPET.title}`
}

export function aboutVersionBadge(version: string): string {
  const v = version.trim() || APP_VERSION_LABEL
  return v.startsWith('v') ? v : `v${v}`
}

export function aboutChannelLabel(mode?: 'desktop' | 'preview'): string {
  return mode === 'preview' ? '预览通道' : '桌面正式'
}

export function aboutEncryptionLabel(encryption?: 'os' | 'unavailable'): string {
  return encryption === 'os' ? '系统密钥环可用' : '密钥环不可用'
}

export function aboutVersionCopyText(version: string): string {
  return (version.trim() || APP_VERSION_LABEL).replace(/^v/i, '')
}

export function aboutDiagnosticsText(input: AboutDiagnosticsInput): string {
  const version = aboutVersionCopyText(input.version)
  const channel = aboutChannelLabel(input.mode)
  const encryption = aboutEncryptionLabel(input.encryption)
  return [`DataAI ${version}`, `通道：${channel}`, `密钥：${encryption}`].join("\n")
}

export function aboutChangelogEmptyBody(): string {
  return '当前没有可展示的更新摘要。完整说明见仓库 apps/desktop/CHANGELOG.md。'
}

export function aboutCopyVersionLabel(): string {
  return '复制版本号'
}

export function aboutCopyDiagnosticsLabel(): string {
  return '复制诊断信息'
}
