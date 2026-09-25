import { describe, expect, it } from 'vitest'
import { assertProductionApiUrl } from './api-url.ts'

describe('assertProductionApiUrl', () => {
  it.each([
    'https://api.blendify.camilasabino.dev',
    'http://127.0.0.1:3000',
    'http://[::1]:3000',
  ])('accepts %s', (value) => {
    expect(assertProductionApiUrl(value)).toBe(value)
  })

  it.each([undefined, '', '   '])('requires a value (%s)', (value) => {
    expect(() => assertProductionApiUrl(value)).toThrow(
      'VITE_API_URL is required for production builds.',
    )
  })

  it.each([
    'http://localhost:3000',
    'http://api.blendify.camilasabino.dev',
    'ftp://api.blendify.camilasabino.dev',
  ])('rejects the insecure URL %s', (value) => {
    expect(() => assertProductionApiUrl(value)).toThrow('must use https')
  })

  it.each([
    'https://api.blendify.camilasabino.dev/',
    'https://api.blendify.camilasabino.dev/api',
    'https://api.blendify.camilasabino.dev?x=1',
  ])('rejects the non-origin URL %s', (value) => {
    expect(() => assertProductionApiUrl(value)).toThrow('must be an origin')
  })

  it('rejects a relative value', () => {
    expect(() => assertProductionApiUrl('/api')).toThrow(
      'must be an absolute URL',
    )
  })
})
