/** Sample fill dialog copy & helpers (M151). */

export const SAMPLE_COUNT_PRESETS = [5, 10, 20, 50] as const

export function sampleFillKicker(): string {
  return '样例数据'
}

export function sampleFillTitle(tableName: string): string {
  const name = tableName.trim() || '表'
  return `填充「${name}」`
}

export function sampleFillLead(): string {
  return '按列类型生成可预览的 INSERT。默认跳过自增主键；可改行数、换一批样例，或先复制 SQL 再改。'
}

export function sampleFillEmptyTitle(): string {
  return '没有可写入的列'
}

export function sampleFillEmptyBody(): string {
  return '当前表只有自增主键或缺少列定义，无法生成 INSERT。请检查表结构后重试。'
}

export function sampleFillColumnsHint(columns: string[]): string {
  if (columns.length === 0) return '将写入列：（无）'
  if (columns.length <= 6) return `将写入列：${columns.join('、')}`
  return `将写入列：${columns.slice(0, 6).join('、')} 等 ${columns.length} 列`
}

export function sampleFillSkippedHint(skipped: string[]): string {
  if (skipped.length === 0) return ''
  return `已跳过自增/标识列：${skipped.join('、')}`
}

export function sampleFillPreviewNote(shown: number, total: number): string {
  if (total <= shown) return `预览全部 ${total} 行`
  return `预览前 ${shown} 行（共 ${total} 行）`
}

export function sampleFillCopiedToast(count: number): string {
  return `已复制 ${count} 条 INSERT`
}

export function sampleFillEditorToast(count: number): string {
  return `已写入编辑器：${count} 条样例 INSERT`
}

export function sampleFillRunToast(count: number): string {
  return `开始执行 ${count} 条样例 INSERT`
}

export function sampleFillReshuffleToast(): string {
  return '已换一批样例值'
}

export function sampleFillCountLabel(): string {
  return '行数（1–200）'
}

export function sampleFillCopySqlLabel(): string {
  return '复制 SQL'
}

export function sampleFillReshuffleLabel(): string {
  return '换一批'
}

export function sampleFillWriteEditorLabel(): string {
  return '写入编辑器'
}

export function sampleFillRunLabel(busy: boolean): string {
  return busy ? '执行中…' : '确认执行'
}

export function clampSampleCount(value: number): number {
  if (!Number.isFinite(value)) return 5
  return Math.min(200, Math.max(1, Math.round(value)))
}
