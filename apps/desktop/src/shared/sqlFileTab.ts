/** SQL file-backed tab labels and save/open copy (M145). */

import { suggestedSqlFileName, tabTitleFromSqlPath } from './sqlFileName'

export function sqlFileBasename(filePath: string | null | undefined): string | null {
  const raw = (filePath ?? '').trim()
  if (!raw) return null
  const name = raw.replace(/^.*[/\\]/, '')
  return name || null
}

export function sqlFileTabTitle(filePath: string): string {
  return tabTitleFromSqlPath(filePath)
}

export function sqlFileSaveDialogTitle(): string {
  return '保存 SQL'
}

export function sqlFileSaveAsDialogTitle(): string {
  return '另存为 SQL'
}

export function sqlFileOpenDialogTitle(): string {
  return '打开 SQL'
}

export function sqlFileSavedToast(filePath: string): string {
  const name = sqlFileBasename(filePath) ?? '文件'
  return `已保存 ${name}`
}

export function sqlFileOpenedToast(filePath: string): string {
  const name = sqlFileBasename(filePath) ?? '文件'
  return `已打开 ${name}`
}

export function sqlFileBannerTitle(): string {
  return '已关联文件'
}

export function sqlFileBannerBody(filePath: string): string {
  const name = sqlFileBasename(filePath) ?? filePath
  return `当前标签对应 ${name}。Ctrl+S 写回该文件；可用「另存为」保存到新路径。`
}

export function sqlFileSaveAsLabel(): string {
  return '另存为'
}

export function sqlFileSaveAsTitle(): string {
  return '另存为新的 .sql 文件'
}

export function sqlFileEmptySaveBody(): string {
  return '当前标签没有内容可保存。先编写 SQL，或从磁盘打开 .sql 文件。'
}

export function defaultSqlSaveName(tabTitle: string | null | undefined, filePath?: string | null): string {
  const fromPath = sqlFileBasename(filePath)
  if (fromPath) return fromPath
  return suggestedSqlFileName(tabTitle)
}
