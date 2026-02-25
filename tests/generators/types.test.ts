import { describe, it, expect } from 'vitest'
import { resolve } from 'path'
import { loadSpec } from '../../src/loader'
import { extractIR } from '../../src/ir'
import { generateTypes } from '../../src/generators/types'

describe('generateTypes', () => {
  it('generates interfaces from schemas', async () => {
    const spec = await loadSpec(resolve(__dirname, '../fixtures/petstore-oas3.yaml'))
    const ir = extractIR(spec)
    const output = generateTypes(ir)

    expect(output).toContain('export interface Pet')
    expect(output).toContain('id: number')
    expect(output).toContain('name: string')
    expect(output).toContain('tag?: string')
  })

  it('generates param types for operations with path params', async () => {
    const spec = await loadSpec(resolve(__dirname, '../fixtures/petstore-oas3.yaml'))
    const ir = extractIR(spec)
    const output = generateTypes(ir)

    expect(output).toContain('export interface GetPetParams')
    expect(output).toContain('petId: string')
  })

  it('generates query param types', async () => {
    const spec = await loadSpec(resolve(__dirname, '../fixtures/petstore-oas3.yaml'))
    const ir = extractIR(spec)
    const output = generateTypes(ir)

    expect(output).toContain('export interface ListPetsParams')
    expect(output).toContain('limit?: number')
  })
})
