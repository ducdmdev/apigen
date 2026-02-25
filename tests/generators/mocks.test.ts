import { describe, it, expect } from 'vitest'
import { resolve } from 'path'
import { loadSpec } from '../../src/loader'
import { extractIR } from '../../src/ir'
import { generateMocks } from '../../src/generators/mocks'

describe('generateMocks', () => {
  it('generates mock constants for schemas', async () => {
    const spec = await loadSpec(resolve(__dirname, '../fixtures/petstore-oas3.yaml'))
    const ir = extractIR(spec)
    const output = generateMocks(ir)

    expect(output).toContain('export const mockPet: Pet')
    expect(output).toContain('id: 1')
    expect(output).toContain("name: 'string'")
  })

  it('generates mock response data for operations', async () => {
    const spec = await loadSpec(resolve(__dirname, '../fixtures/petstore-oas3.yaml'))
    const ir = extractIR(spec)
    const output = generateMocks(ir)

    expect(output).toContain('export const mockListPetsResponse')
    expect(output).toContain('[mockPet]')
    expect(output).toContain('export const mockGetPetResponse')
  })

  it('imports types', async () => {
    const spec = await loadSpec(resolve(__dirname, '../fixtures/petstore-oas3.yaml'))
    const ir = extractIR(spec)
    const output = generateMocks(ir)

    expect(output).toContain("import type { Pet")
  })

  it('skips empty type import when no schemas exist', () => {
    const ir = { operations: [], schemas: [] }
    const output = generateMocks(ir)

    expect(output).not.toContain('import type')
    expect(output).not.toContain('import type {  }')
  })
})
