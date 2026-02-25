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
})
