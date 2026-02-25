import { describe, it, expect } from 'vitest'
import { generateProvider } from '../../src/generators/provider'

describe('generateProvider', () => {
  it('generates test mode provider with context', () => {
    const output = generateProvider()

    expect(output).toContain('ApiTestModeProvider')
    expect(output).toContain('useApiTestMode')
    expect(output).toContain('createContext')
    expect(output).toContain('enabled: boolean')
  })
})
