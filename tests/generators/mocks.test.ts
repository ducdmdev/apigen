import { describe, it, expect } from 'vitest'
import { resolve } from 'path'
import { loadSpec } from '../../src/loader'
import { extractIR } from '../../src/ir'
import type { IR } from '../../src/ir'
import { generateMocks } from '../../src/generators/mocks'

describe('generateMocks', () => {
  it('generates mock constants for schemas with realistic values', async () => {
    const spec = await loadSpec(resolve(__dirname, '../fixtures/petstore-oas3.yaml'))
    const ir = extractIR(spec)
    const output = generateMocks(ir)

    expect(output).toContain('export const mockPet: Pet')
    // id field should get a UUID (faker heuristic for "id")
    expect(output).toMatch(/id: '[0-9a-f-]+'/)
    // name field should get a realistic name (not 'string')
    expect(output).not.toContain("name: 'string'")
    expect(output).toContain('name:')
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

  it('does not emit duplicate response mocks for inline schemas', async () => {
    const spec = await loadSpec(resolve(__dirname, '../fixtures/inline-schemas.yaml'))
    const ir = extractIR(spec)
    const output = generateMocks(ir)

    // Should have exactly one declaration of each mock
    const searchResponseMatches = output.match(/export const mockSearchBgInsuranceResponse/g)
    expect(searchResponseMatches).toHaveLength(1)

    const getByIdResponseMatches = output.match(/export const mockGetByIdBgInsuranceResponse/g)
    expect(getByIdResponseMatches).toHaveLength(1)
  })

  it('returns numeric timestamp for date-named fields with number type', () => {
    const ir: IR = {
      operations: [],
      schemas: [{
        name: 'Contract',
        properties: [
          { name: 'terminationDate', type: 'number', required: true, isArray: false, itemType: null, ref: null, enumValues: null },
          { name: 'createdAt', type: 'number', required: true, isArray: false, itemType: null, ref: null, enumValues: null },
          { name: 'startDate', type: 'string', required: true, isArray: false, itemType: null, ref: null, enumValues: null },
        ],
        required: ['terminationDate', 'createdAt', 'startDate'],
      }],
    }
    const output = generateMocks(ir)

    // number-typed date fields should get numeric values, not ISO strings
    expect(output).toMatch(/terminationDate: \d+/)
    expect(output).not.toMatch(/terminationDate: '/)
    expect(output).toMatch(/createdAt: \d+/)
    expect(output).not.toMatch(/createdAt: '/)
    // string-typed date field should still get ISO string
    expect(output).toMatch(/startDate: '/)
  })

  it('generates mock value for union type by using first variant', () => {
    const ir: IR = {
      operations: [],
      schemas: [{
        name: 'FlexItem',
        properties: [
          { name: 'value', type: 'string | boolean', required: true, isArray: false, itemType: null, ref: null, enumValues: null },
        ],
        required: ['value'],
      }],
    }
    const output = generateMocks(ir)
    // Should pick first variant (string), not fall through to 'null as unknown'
    expect(output).not.toContain('null as unknown')
  })

  it('generates {} for object type and null as unknown for unknown type', () => {
    const ir = {
      operations: [],
      schemas: [{
        name: 'TestSchema',
        properties: [
          { name: 'data', type: 'object', required: true, isArray: false, itemType: null, ref: null, enumValues: null },
          { name: 'meta', type: 'unknown', required: false, isArray: false, itemType: null, ref: null, enumValues: null },
        ],
        required: ['data'],
      }],
    }
    const output = generateMocks(ir)

    expect(output).toContain('data: {},')
    expect(output).toContain('meta: null as unknown,')
  })

  it('generates {} for object-typed properties even when name matches faker heuristic', () => {
    const ir: IR = {
      operations: [],
      schemas: [{
        name: 'Insurance',
        properties: [
          { name: 'address', type: 'object', required: false, isArray: false, itemType: null, ref: null, enumValues: null },
          { name: 'contact', type: 'object', required: false, isArray: false, itemType: null, ref: null, enumValues: null },
        ],
        required: [],
      }],
    }
    const output = generateMocks(ir)

    expect(output).toContain('address: {},')
    expect(output).toContain('contact: {},')
    expect(output).not.toMatch(/address: '/)
    expect(output).not.toMatch(/contact: '/)
  })
})
