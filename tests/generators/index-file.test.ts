import { describe, it, expect } from 'vitest'
import { generateIndexFile, generateRootIndexFile } from '../../src/generators/index-file'

describe('generateIndexFile', () => {
  it('includes types, hooks, mocks, and provider when mock is enabled', () => {
    const output = generateIndexFile({ mock: true })

    expect(output).toContain("export * from './types'")
    expect(output).toContain("export * from './hooks'")
    expect(output).toContain("export * from './mocks'")
    expect(output).toContain("export * from './test-mode-provider'")
  })

  it('excludes mocks and provider when mock is disabled', () => {
    const output = generateIndexFile({ mock: false })

    expect(output).toContain("export * from './types'")
    expect(output).toContain("export * from './hooks'")
    expect(output).not.toContain("mocks")
    expect(output).not.toContain("test-mode-provider")
  })

  it('excludes provider when includeProvider is false', () => {
    const output = generateIndexFile({ mock: true, includeProvider: false })

    expect(output).toContain("export * from './mocks'")
    expect(output).not.toContain("test-mode-provider")
  })

  it('includes auto-generated headers', () => {
    const output = generateIndexFile()

    expect(output).toContain('/* eslint-disable */')
    expect(output).toContain('auto-generated')
  })
})

describe('generateRootIndexFile', () => {
  it('re-exports all tag slugs', () => {
    const output = generateRootIndexFile(['users', 'pets'], { mock: true })

    expect(output).toContain("export * from './users'")
    expect(output).toContain("export * from './pets'")
    expect(output).toContain("export * from './test-mode-provider'")
  })

  it('excludes provider when mock is disabled', () => {
    const output = generateRootIndexFile(['users'], { mock: false })

    expect(output).toContain("export * from './users'")
    expect(output).not.toContain("test-mode-provider")
  })

  it('includes auto-generated headers', () => {
    const output = generateRootIndexFile(['users'])

    expect(output).toContain('/* eslint-disable */')
    expect(output).toContain('auto-generated')
  })
})
