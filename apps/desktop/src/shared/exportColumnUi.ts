/** Export column dialog copy & filter helpers (M157). */

export function exportColumnKicker(): string {
  return '导出列'
}

export function exportColumnTitle(formatLabel: string): string {
  return `导出 ${formatLabel} · 选择列`
}

export function exportColumnFilterPlaceholder(): string {
  return '筛选列名…'
}

export function exportColumnFilterAria(): string {
  return '筛选导出列'
}

export function filterExportColumns(columns: string[], query: string): string[] {
  const q = query.trim().toLowerCase()
  if (!q) return [...columns]
  return columns.filter((column) => column.toLowerCase().includes(q))
}

export function invertExportColumns(all: string[], picked: readonly string[]): string[] {
  const selected = new Set(picked)
  return all.filter((column) => !selected.has(column))
}

export function exportColumnCountLabel(selected: number, total: number, rows: number): string {
  return `已选 ${selected}/${total} 列 · ${rows.toLocaleString('zh-CN')} 行`
}

export function exportColumnNoColumnsTitle(): string {
  return '没有可导出的列'
}

export function exportColumnNoColumnsBody(): string {
  return '当前结果没有可见列。先显示至少一列，或重新运行查询后再导出。'
}

export function exportColumnFilterEmptyTitle(): string {
  return '没有匹配的列'
}

export function exportColumnFilterEmptyBody(query: string): string {
  const q = query.trim() || '…'
  return `没有列名包含「${q}」。清空筛选或换个关键字。`
}

export function exportColumnZeroRowsTitle(): string {
  return '当前没有可导出的行'
}

export function exportColumnZeroRowsBody(): string {
  return '筛选或选中范围下为 0 行。调整结果筛选 / 行范围后再导出。'
}

export function exportColumnSelectAllLabel(): string {
  return '全选'
}

export function exportColumnSelectNoneLabel(): string {
  return '全不选'
}

export function exportColumnInvertLabel(): string {
  return '反选'
}

export function exportColumnConfirmLabel(formatLabel: string): string {
  return `导出 ${formatLabel}`
}

export function exportColumnVisibleOnlyHint(filtered: number, total: number): string {
  if (filtered >= total) return ''
  return `显示 ${filtered}/${total} 列（筛选中）`
}
