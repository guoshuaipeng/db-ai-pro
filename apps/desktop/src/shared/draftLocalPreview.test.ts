import { describe, expect, it } from 'vitest'
import {
  draftLocalPreviewAnswer,
  isRetailSampleCatalog,
  preferredTableFromSql,
} from './draftLocalPreview'
import type { TableSpec } from './schema'

const clientUser: TableSpec = {
  name: 'client_user',
  columns: [
    { name: 'id', dataType: 'bigint' },
    { name: 'avatar', dataType: 'varchar' },
    { name: 'name', dataType: 'varchar' },
  ],
}

const retail: TableSpec[] = [
  {
    name: 'customers',
    columns: [
      { name: 'id', dataType: 'INTEGER' },
      { name: 'name', dataType: 'TEXT' },
      { name: 'region', dataType: 'TEXT' },
    ],
  },
  {
    name: 'orders',
    columns: [{ name: 'id', dataType: 'INTEGER' }],
  },
]

describe('draftLocalPreviewAnswer', () => {
  it('does not emit retail customers SQL for snowy-cloud-like catalogs', () => {
    const text = draftLocalPreviewAnswer({
      prompt: '客户表有多少数据',
      tables: [clientUser],
      dialect: 'mysql',
      databaseName: 'snowy-cloud',
      preferredTable: 'client_user',
    })
    expect(text).toMatch(/client_user/)
    expect(text).toMatch(/snowy-cloud/)
    expect(text).toMatch(/COUNT\(\*\)/i)
    expect(text).not.toMatch(/FROM customers/i)
  })

  it('returns guidance when catalog empty', () => {
    const text = draftLocalPreviewAnswer({
      prompt: '客户表有多少数据',
      tables: [],
      databaseName: 'snowy-cloud',
    })
    expect(text).toMatch(/没有读到表结构/)
    expect(text).not.toMatch(/FROM customers/i)
  })

  it('still allows retail templates for sample catalog', () => {
    expect(isRetailSampleCatalog(retail)).toBe(true)
    const text = draftLocalPreviewAnswer({
      prompt: '客户总览',
      tables: retail,
      dialect: 'sqlite',
    })
    expect(text).toMatch(/FROM customers/i)
  })

  it('parses preferred table from qualified SQL', () => {
    expect(
      preferredTableFromSql('SELECT * FROM `snowy-cloud`.`client_user` LIMIT 100'),
    ).toBe('client_user')
  })
})
