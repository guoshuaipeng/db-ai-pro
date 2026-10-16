import { describe, expect, it } from 'vitest'
import {
  treeColumnCopyText,
  treeDatabaseCopyText,
  treeIdentCopiedToast,
  treeTableCopyText,
} from './treeIdentCopy'

describe('treeIdentCopy', () => {
  it('qualifies mysql table with database', () => {
    expect(treeTableCopyText('mysql', 'orders', 'shop')).toBe('`shop`.`orders`')
  })

  it('quotes odd column names only when needed', () => {
    expect(treeColumnCopyText('postgresql', 'id')).toBe('id')
    expect(treeColumnCopyText('postgresql', 'order date')).toBe('"order date"')
  })

  it('copies database ident', () => {
    expect(treeDatabaseCopyText('mysql', 'my-db')).toBe('`my-db`')
  })

  it('toast clips long text', () => {
    const long = 'a'.repeat(60)
    expect(treeIdentCopiedToast(long).startsWith('已复制 ')).toBe(true)
    expect(treeIdentCopiedToast(long).endsWith('…')).toBe(true)
  })
})
