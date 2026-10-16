/** Snippet / query-template insert copy & helpers (M147). */

import { expandSnippet, extractSnippetVars } from './snippetVars'

export function snippetVarLabel(name: string): string {
  switch (name) {
    case 'table':
    case 'tables':
      return '表名'
    case 'column':
      return '列名'
    case 'columns':
      return '列清单'
    case 'limit':
      return '行数上限'
    case 'value':
    case 'values':
      return '值'
    case 'id':
      return '主键 / id'
    default:
      return name
  }
}

export function snippetVarPlaceholder(name: string): string {
  switch (name) {
    case 'table':
    case 'tables':
      return '例如 orders'
    case 'column':
      return '例如 status'
    case 'columns':
      return '例如 id, name'
    case 'limit':
      return '例如 100'
    case 'value':
    case 'values':
      return "例如 'active'"
    case 'id':
      return '例如 1'
    default:
      return `填写 ${name}`
  }
}

export function snippetVarHint(name: string): string | null {
  switch (name) {
    case 'table':
      return '可先在对象树选中表，或用手写表名。'
    case 'limit':
      return '建议从较小行数试跑，再按需增大。'
    case 'columns':
      return '多列用逗号分隔，无需括号。'
    case 'id':
      return '删除 / 更新前请确认条件，避免误伤全表。'
    default:
      return null
  }
}

export function snippetVarsDialogTitle(): string {
  return '填写模板变量'
}

export function snippetVarsDialogLead(templateTitle: string): string {
  const title = templateTitle.trim() || '模板'
  return `「${title}」需要补全占位符后再插入编辑器。`
}

export function snippetPreviewLabel(): string {
  return '预览'
}

export function snippetInsertToast(templateTitle: string): string {
  const title = templateTitle.trim() || '模板'
  return `已插入「${title}」`
}

export function snippetInsertPlainToast(templateTitle: string): string {
  const title = templateTitle.trim() || '模板'
  return `已插入「${title}」（无变量）`
}

export function snippetTemplateVarsBadge(sql: string): string | null {
  const vars = extractSnippetVars(sql)
  if (vars.length === 0) return null
  return vars.map((name) => `{{${name}}}`).join(' · ')
}

export function snippetEmptyTemplatesBody(): string {
  return '当前没有可用的查询模板。'
}

export function snippetExpandedPreview(sql: string, values: Record<string, string>, maxLen = 280): string {
  const expanded = expandSnippet(sql, values).trim()
  if (!expanded) return '（预览为空，请填写上方变量）'
  if (expanded.length <= maxLen) return expanded
  return `${expanded.slice(0, maxLen)}…`
}
