import { describe, expect, it } from 'vitest'
import { draftAlterTable, draftCreateTable } from './ddlDraft'
import { rowsToCsv, rowsToJson } from './exportTable'

describe('ddlDraft', () => {
  it('drafts sqlite create table', () => {
    const sql = draftCreateTable({ prompt: '建一个客户标签表，含名称和创建时间', dialect: 'sqlite' })
    expect(sql).toMatch(/CREATE TABLE/i)
    expect(sql).toMatch(/name/i)
    expect(sql).toMatch(/created_at/i)
  })

  it('uses reference column types when possible', () => {
    const sql = draftCreateTable({
      prompt: '按客户表风格新建备注表，含名称和创建时间',
      dialect: 'sqlite',
      reference: {
        name: 'customers',
        columns: [
          { name: 'id', dataType: 'INTEGER' },
          { name: 'name', dataType: 'TEXT' },
          { name: 'created_at', dataType: 'TEXT' },
        ],
      },
    })
    expect(sql).toContain('参考表 customers')
    expect(sql).toMatch(/"name" TEXT/i)
    expect(sql).toMatch(/"created_at" TEXT/i)
  })

  it('drafts alter add column', () => {
    const sql = draftAlterTable({ prompt: '给客户表加一个邮箱字段', dialect: 'mysql', table: 'customers' })
    expect(sql).toMatch(/ALTER TABLE/i)
    expect(sql).toMatch(/email/i)
  })
})

describe('exportTable', () => {
  it('exports csv and json', () => {
    const columns = ['id', 'name']
    const rows = [{ id: 1, name: 'a,b' }, { id: 2, name: null }]
    expect(rowsToCsv(columns, rows)).toContain('"a,b"')
    expect(rowsToJson(columns, rows)).toContain('"id": 1')
  })
})
