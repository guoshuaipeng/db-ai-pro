/** Query param dialog copy & helpers (M156). */

export function queryParamKicker(): string {
  return '查询参数'
}

export function queryParamLead(): string {
  return '检测到 {{name}} 占位符。默认仅替换后执行，不改编辑器原文；勾选「同时写回编辑器」才会改 SQL。'
}

export function queryParamNoVarsTitle(): string {
  return '没有可填写的参数'
}

export function queryParamNoVarsBody(): string {
  return '当前 SQL 不含 {{name}} 占位符。可关闭此对话框后直接运行。'
}

export function queryParamProgress(filled: number, total: number): string {
  return `已填 ${filled}/${total} 项`
}

export function queryParamEmptyHint(emptyCount: number): string {
  if (emptyCount <= 0) return ''
  return `${emptyCount} 项仍为空（将替换为空字符串）`
}

export function countFilledParams(vars: string[], values: Record<string, string>): number {
  return vars.filter((name) => (values[name] ?? '').trim() !== '').length
}

export function clearQueryParamValues(vars: string[]): Record<string, string> {
  const next: Record<string, string> = {}
  for (const name of vars) next[name] = ''
  return next
}

export function queryParamClearLabel(): string {
  return '清空'
}

export function queryParamCopyPreviewLabel(): string {
  return '复制预览 SQL'
}

export function queryParamPreviewCopiedToast(): string {
  return '已复制替换后的 SQL'
}

export function queryParamWriteBackLabel(): string {
  return '同时写回编辑器'
}

export function queryParamPreviewLabel(): string {
  return '替换预览'
}

export function queryParamFieldLabel(varName: string): string {
  return `{{${varName}}}`
}
