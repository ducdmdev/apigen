import { describe, it, expect } from 'vitest'
import { generateApiFetch } from '../../src/generators/api-fetch'

describe('generateApiFetch', () => {
  it('generates apiFetch function', () => {
    const output = generateApiFetch()

    expect(output).toContain('export function apiFetch')
    expect(output).toContain('fetch(path')
    expect(output).toContain('Content-Type')
    expect(output).toContain('application/json')
  })

  it('includes error handling', () => {
    const output = generateApiFetch()

    expect(output).toContain('if (!res.ok)')
    expect(output).toContain('throw new Error')
  })

  it('includes auto-generated headers', () => {
    const output = generateApiFetch()

    expect(output).toContain('/* eslint-disable */')
    expect(output).toContain('auto-generated')
  })
})
