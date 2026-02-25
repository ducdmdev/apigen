import { describe, it, expect } from 'vitest'
import { resolve } from 'path'
import { loadSpec } from '../src/loader'
import { extractIR } from '../src/ir'

describe('extractIR', () => {
  it('extracts operations from petstore spec', async () => {
    const spec = await loadSpec(resolve(__dirname, 'fixtures/petstore-oas3.yaml'))
    const ir = extractIR(spec)

    expect(ir.operations).toHaveLength(3)

    const listPets = ir.operations.find(op => op.operationId === 'listPets')
    expect(listPets).toBeDefined()
    expect(listPets!.method).toBe('get')
    expect(listPets!.path).toBe('/pets')
    expect(listPets!.queryParams).toHaveLength(1)
    expect(listPets!.queryParams[0].name).toBe('limit')

    const createPet = ir.operations.find(op => op.operationId === 'createPet')
    expect(createPet).toBeDefined()
    expect(createPet!.method).toBe('post')
    expect(createPet!.requestBody).toBeDefined()

    const getPet = ir.operations.find(op => op.operationId === 'getPet')
    expect(getPet).toBeDefined()
    expect(getPet!.pathParams).toHaveLength(1)
    expect(getPet!.pathParams[0].name).toBe('petId')
  })

  it('extracts schemas from petstore spec', async () => {
    const spec = await loadSpec(resolve(__dirname, 'fixtures/petstore-oas3.yaml'))
    const ir = extractIR(spec)

    expect(ir.schemas).toHaveLength(2)

    const pet = ir.schemas.find(s => s.name === 'Pet')
    expect(pet).toBeDefined()
    expect(pet!.properties).toHaveLength(3)
    expect(pet!.required).toContain('id')
    expect(pet!.required).toContain('name')
  })

  it('preserves digits in fallback operationId', () => {
    const spec = {
      paths: {
        '/v2/users': {
          get: {
            responses: { '200': { description: 'ok' } },
          },
        },
      },
      components: { schemas: {} },
    }
    const ir = extractIR(spec as Record<string, unknown>)
    const op = ir.operations[0]
    expect(op.operationId).toBe('get_v2_users')
  })

  it('extracts response schema references', async () => {
    const spec = await loadSpec(resolve(__dirname, 'fixtures/petstore-oas3.yaml'))
    const ir = extractIR(spec)

    const listPets = ir.operations.find(op => op.operationId === 'listPets')
    expect(listPets!.responseSchema).toBeDefined()
    expect(listPets!.responseSchema!.type).toBe('array')
  })
})
