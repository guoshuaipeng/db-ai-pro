/** Ensures multi-DB MySQL structure calls qualify schema the same way browse does. */
import { describe, expect, it } from 'vitest'
import { qualifyBrowseTable } from './tablePaging'

describe('table structure schema context', () => {
  it('qualifies dotted MySQL database names for SHOW CREATE / inspect', () => {
    expect(qualifyBrowseTable('mysql', 'client_file_crawler', 'clientdata.main')).toBe(
      '`clientdata.main`.`client_file_crawler`',
    )
  })

  it('falls back to bare table when databaseName omitted', () => {
    expect(qualifyBrowseTable('mysql', 'client_file_crawler')).toBe('`client_file_crawler`')
  })
})
