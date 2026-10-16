/** SQL editor drag/drop overlay & toasts (M167). */

export type EditorDropKind = 'file' | 'snippet' | 'mixed' | 'unknown'

export function editorDropHintTitle(kind: EditorDropKind): string {
  if (kind === 'file') return '打开 SQL 文件'
  if (kind === 'snippet') return '插入 SQL 片段'
  if (kind === 'mixed') return '放到编辑器'
  return '放到此处'
}

export function editorDropHintBody(kind: EditorDropKind): string {
  if (kind === 'file') return '松开以用新标签打开 .sql / .txt（其他类型会忽略）'
  if (kind === 'snippet') return '松开以在光标处插入拖来的 SQL'
  if (kind === 'mixed') return '文件将打开为标签；对象/收藏片段会插入当前编辑器'
  return '可拖入 .sql / .txt 文件，或从对象树 / 收藏 / 历史拖入片段'
}

export function editorDropOverlayAria(kind: EditorDropKind): string {
  return `${editorDropHintTitle(kind)}。${editorDropHintBody(kind)}`
}

export function editorDropOpenedToast(fileCount: number): string {
  const n = Math.max(0, fileCount)
  if (n <= 0) return '没有可打开的 SQL 文件'
  if (n === 1) return '已用新标签打开 1 个 SQL 文件'
  return `已用新标签打开 ${n.toLocaleString('zh-CN')} 个 SQL 文件`
}

export function editorDropRejectedToast(rejectedCount: number): string {
  const n = Math.max(0, rejectedCount)
  if (n <= 0) return ''
  return `已忽略 ${n.toLocaleString('zh-CN')} 个非 .sql/.txt 文件`
}

export function editorDropEmptyToast(): string {
  return '没有可打开的 .sql / .txt 文件'
}

export function editorDropSnippetToast(): string {
  return '已插入拖放的 SQL'
}
