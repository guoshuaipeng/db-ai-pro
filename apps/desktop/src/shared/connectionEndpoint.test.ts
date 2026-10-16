import { describe, expect, it } from 'vitest'
import { connectionEndpointCopiedToast, connectionEndpointText } from './connectionEndpoint'

describe('connectionEndpointText', () => {
  it('uses sqlite file path', () => {
    expect(
      connectionEndpointText({ dialect: 'sqlite', filePath: 'E:\\data\\app.db' }),
    ).toBe('E:\\data\\app.db')
  })

  it('builds server URL without password', () => {
    expect(
      connectionEndpointText({
        dialect: 'mysql',
        host: 'db.example',
        port: 3307,
        database: 'shop',
        username: 'app',
      }),
    ).toBe('mysql://app@db.example:3307/shop')
  })

  it('fills default port when omitted', () => {
    expect(
      connectionEndpointText({ dialect: 'postgresql', host: '127.0.0.1', database: 'postgres' }),
    ).toBe('postgresql://127.0.0.1:5432/postgres')
  })

  it('toast clips long text', () => {
    const long = 'x'.repeat(80)
    expect(connectionEndpointCopiedToast(long).endsWith('…')).toBe(true)
  })
})
