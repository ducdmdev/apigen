import { describe, it, expect } from 'vitest'
import { resolve } from 'path'
import { loadSpec, detectSpecVersion } from '../src/loader'

describe('detectSpecVersion', () => {
  it('detects swagger 2.0', () => {
    expect(detectSpecVersion({ swagger: '2.0' })).toBe('swagger2')
  })

  it('detects openapi 3.0', () => {
    expect(detectSpecVersion({ openapi: '3.0.3' })).toBe('openapi3')
  })

  it('returns unknown for unrecognized', () => {
    expect(detectSpecVersion({})).toBe('unknown')
  })
})

describe('loadSpec', () => {
  it('loads OpenAPI 3.0 spec', async () => {
    const spec = await loadSpec(resolve(__dirname, 'fixtures/petstore-oas3.yaml'))
    expect(spec.openapi).toMatch(/^3\./)
    expect(spec.paths['/pets']).toBeDefined()
    expect(spec.components?.schemas?.Pet).toBeDefined()
  })

  it('loads and converts Swagger 2.0 spec to OpenAPI 3.0', async () => {
    const spec = await loadSpec(resolve(__dirname, 'fixtures/petstore-swagger2.yaml'))
    expect(spec.openapi).toMatch(/^3\./)
    expect(spec.paths['/pets']).toBeDefined()
  })
})
