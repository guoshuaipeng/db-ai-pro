/** Schema Diff panel copy & clipboard (M150). */

import type { ColumnDiff, ColumnDiffKind } from './schemaDiff'
import { summarizeDiff } from './schemaDiff'

export function schemaDiffKicker(): string {
  return '表结构对比'
}

export function schemaDiffTitle(): string {
  return '对比两张表的列'
}

export function schemaDiffLead(): string {
  return '可跨连接选择左侧参考表与右侧目标表。建议 ALTER 作用于右侧；执行前请再确认。'
}

export function schemaDiffNoTablesTitle(): string {
  return '还没有可对比的表'
}

export function schemaDiffNoTablesBody(): string {
  return '先连接数据库并刷新对象树，展开到表节点后再打开对比。也可从「表结构」页一键带入当前表。'
}

export function schemaDiffIdleTitle(): string {
  return '选择两侧表开始对比'
}

export function schemaDiffIdleBody(): string {
  return '左右可指向不同连接上的同名或异名表。点击「对比」查看仅左 / 仅右 / 类型差异。'
}

export function schemaDiffMatchTitle(): string {
  return '列结构一致'
}

export function schemaDiffMatchBody(): string {
  return '两侧列名、类型、可空与主键定义均匹配。可取消「隐藏相同列」查看完整清单，或换一侧表再比。'
}

export function schemaDiffFilteredEmptyTitle(): string {
  return '当前筛选下没有差异行'
}

export function schemaDiffFilteredEmptyBody(): string {
  return '试试切换差异类型芯片，或关闭「隐藏相同列」。'
}

export function schemaDiffKindLabel(kind: ColumnDiffKind): string {
  if (kind === 'added') return '仅右侧'
  if (kind === 'removed') return '仅左侧'
  if (kind === 'changed') return '有差异'
  return '相同'
}

export function schemaDiffChangeFieldLabel(field: string): string {
  if (field === 'type') return '类型'
  if (field === 'nullable') return '可空'
  if (field === 'default') return '默认值'
  if (field === 'primaryKey') return '主键'
  return field
}

export function schemaDiffRowHint(row: ColumnDiff): string {
  if (row.kind === 'changed' && row.changes?.length) {
    return row.changes.map(schemaDiffChangeFieldLabel).join('、')
  }
  if (row.kind === 'removed') return '右侧缺少（建议 ADD）'
  if (row.kind === 'added') return '左侧没有（建议 DROP）'
  return ''
}

export function formatSchemaDiffSummaryClipboard(input: {
  leftLabel: string
  rightLabel: string
  diffs: ColumnDiff[]
}): string {
  const s = summarizeDiff(input.diffs)
  const lines = [
    `表结构对比：${input.leftLabel} → ${input.rightLabel}`,
    `仅左 ${s.removed} · 仅右 ${s.added} · 差异 ${s.changed} · 相同 ${s.same}`,
  ]
  const interesting = input.diffs.filter((d) => d.kind !== 'same')
  for (const row of interesting) {
    const hint = schemaDiffRowHint(row)
    lines.push(`- ${row.name} · ${schemaDiffKindLabel(row.kind)}${hint ? ` · ${hint}` : ''}`)
  }
  if (interesting.length === 0) {
    lines.push('- （无列级差异）')
  }
  return lines.join('\n')
}

export function schemaDiffSummaryCopiedToast(): string {
  return '已复制对比摘要'
}

export function schemaDiffSqlInsertedToast(): string {
  return '已插入建议 ALTER SQL'
}

export function schemaDiffSwappedToast(): string {
  return '已交换左右两侧'
}

export function schemaDiffCompareLabel(loading: boolean): string {
  return loading ? '对比中…' : '对比'
}

export function schemaDiffSwapLabel(): string {
  return '交换两侧'
}

export function schemaDiffCopySummaryLabel(): string {
  return '复制摘要'
}

export function schemaDiffInsertSqlLabel(): string {
  return '插入建议 SQL'
}
