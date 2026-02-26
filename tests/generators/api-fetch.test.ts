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

  it('generates apiFetch with baseURL when provided', () => {
    const output = generateApiFetch({ baseURL: 'https://api.example.com' })
    expect(output).toContain('https://api.example.com')
    expect(output).toContain('`https://api.example.com${path}`')
  })

  it('generates apiFetch without baseURL when not provided', () => {
    const output = generateApiFetch()
    expect(output).not.toContain('https://')
    expect(output).toContain('fetch(path')
  })
})
