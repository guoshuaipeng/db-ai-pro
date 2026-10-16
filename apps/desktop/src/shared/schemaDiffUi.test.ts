import { describe, expect, it } from 'vitest'
import { diffTableColumns } from './schemaDiff'
import type { TableColumnInfo } from './tableStructure'
import {
  formatSchemaDiffSummaryClipboard,
  schemaDiffIdleTitle,
  schemaDiffKindLabel,
  schemaDiffMatchTitle,
  schemaDiffNoTablesTitle,
  schemaDiffRowHint,
  schemaDiffSummaryCopiedToast,
} from './schemaDiffUi'

const col = (partial: Partial<TableColumnInfo> & { name: string }): TableColumnInfo => ({
  dataType: 'TEXT',
  nullable: true,
  defaultValue: null,
  primaryKey: false,
  ordinal: 0,
  ...partial,
})

describe('schemaDiffUi', () => {
  it('exposes Chinese empty-state copy', () => {
    expect(schemaDiffNoTablesTitle()).toContain('没有')
    expect(schemaDiffIdleTitle()).toContain('选择')
    expect(schemaDiffMatchTitle()).toContain('一致')
    expect(schemaDiffKindLabel('removed')).toBe('仅左侧')
    expect(schemaDiffKindLabel('added')).toBe('仅右侧')
    expect(schemaDiffSummaryCopiedToast()).toContain('摘要')
  })

  it('formats clipboard summary with diffs', () => {
    const diffs = diffTableColumns(
      [
        col({ name: 'id', dataType: 'INTEGER', primaryKey: true, nullable: false }),
        col({ name: 'name', dataType: 'TEXT' }),
      ],
      [
        col({ name: 'id', dataType: 'INTEGER', primaryKey: true, nullable: false }),
        col({ name: 'name', dataType: 'VARCHAR(40)' }),
        col({ name: 'email', dataType: 'TEXT' }),
      ],
    )
    const text = formatSchemaDiffSummaryClipboard({
      leftLabel: 'a / users',
      rightLabel: 'b / users',
      diffs,
    })
    expect(text).toContain('a / users')
    expect(text).toContain('仅右')
    expect(text).toContain('name')
    expect(text).toContain('email')
    const changed = diffs.find((d) => d.name === 'name')!
    expect(schemaDiffRowHint(changed)).toContain('类型')
  })
})
