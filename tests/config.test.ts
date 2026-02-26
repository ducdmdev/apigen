import { describe, it, expect } from 'vitest'
import { defineConfig, resolveConfig } from '../src/config'

describe('config', () => {
  it('defineConfig returns config as-is', () => {
    const config = defineConfig({
      input: './openapi.yaml',
      output: './src/api/generated',
    })
    expect(config.input).toBe('./openapi.yaml')
    expect(config.output).toBe('./src/api/generated')
    expect(config.mock).toBe(true)
  })

  it('resolveConfig applies defaults', () => {
    const config = resolveConfig({ input: './spec.yaml' })
    expect(config.output).toBe('./src/api/generated')
    expect(config.mock).toBe(true)
  })

  it('resolveConfig applies split default to false', () => {
    const config = resolveConfig({ input: './spec.yaml' })
    expect(config.split).toBe(false)
  })

  it('resolveConfig passes through split, baseURL, apiFetchImportPath', () => {
    const config = resolveConfig({
      input: './spec.yaml',
      split: true,
      baseURL: 'https://api.example.com',
      apiFetchImportPath: './lib/api-client',
    })
    expect(config.split).toBe(true)
    expect(config.baseURL).toBe('https://api.example.com')
    expect(config.apiFetchImportPath).toBe('./lib/api-client')
  })

  it('resolveConfig leaves baseURL and apiFetchImportPath undefined when not set', () => {
    const config = resolveConfig({ input: './spec.yaml' })
    expect(config.baseURL).toBeUndefined()
    expect(config.apiFetchImportPath).toBeUndefined()
  })
})
