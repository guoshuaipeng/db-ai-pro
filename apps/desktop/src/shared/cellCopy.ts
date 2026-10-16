/** Result-grid cell copy affordances (M107). */

export function cellValueCopiedNote(): string {
  return '已复制单元格'
}

/** Tooltip suffix for grid cells. */
export function cellCopyClickHint(canEditSqlite: boolean): string {
  const base = '双击查看 · Shift+双击复制 · Ctrl+C 复制'
  return canEditSqlite ? `${base} · Enter 编辑` : base
}
