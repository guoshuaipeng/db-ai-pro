import { describe, expect, it } from 'vitest'
import { connectionColorPatch } from './connColorQuick'

const base = {
  id: 'c1',
  name: 'prod',
  dialect: 'mysql' as const,
  host: '10.0.0.1',
  port: 3306,
  database: 'app',
  username: 'root',
  hasPassword: true,
  readOnly: false,
  groupId: 'g1',
  colorTag: 'blue',
  createdAt: '2026-01-01T00:00:00Z',
  updatedAt: '2026-01-02T00:00:00Z',
}

describe('connectionColorPatch', () => {
  it('patches color without password field', () => {
    const input = connectionColorPatch(base, 'rose')
    expect(input).toMatchObject({
      id: 'c1',
      name: 'prod',
      dialect: 'mysql',
      host: '10.0.0.1',
      colorTag: 'rose',
      groupId: 'g1',
    })
    expect(input.password).toBeUndefined()
  })

  it('clears color with null and maps sqlite path', () => {
    const sqlite = {
      ...base,
      dialect: 'sqlite' as const,
      filePath: 'C:\\data\\a.db',
      host: undefined,
      port: undefined,
      database: undefined,
      username: undefined,
    }
    const input = connectionColorPatch(sqlite, null)
    expect(input.filePath).toBe('C:\\data\\a.db')
    expect(input.colorTag).toBeNull()
    expect(input.host).toBeUndefined()
  })
})