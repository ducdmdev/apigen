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

  it('generates smart fallback operationId from path', () => {
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
    expect(op.operationId).toBe('listUsers')
  })

  it('extracts response schema references', async () => {
    const spec = await loadSpec(resolve(__dirname, 'fixtures/petstore-oas3.yaml'))
    const ir = extractIR(spec)

    const listPets = ir.operations.find(op => op.operationId === 'listPets')
    expect(listPets!.responseSchema).toBeDefined()
    expect(listPets!.responseSchema!.type).toBe('array')
  })

  it('generates smart operationId with action suffixes', () => {
    const spec = {
      paths: {
        '/masterdata/bg-insurance/search': { post: { responses: { '200': { description: 'ok' } } } },
        '/masterdata/bg-insurance/get-by-id': { post: { responses: { '200': { description: 'ok' } } } },
        '/masterdata/bg-insurance/get-by-ids': { post: { responses: { '200': { description: 'ok' } } } },
        '/masterdata/bg-insurance/get-by-query': { post: { responses: { '200': { description: 'ok' } } } },
        '/masterdata/sdebm/upsert': { post: { responses: { '200': { description: 'ok' } } } },
        '/masterdata/sdebm/delete': { post: { responses: { '200': { description: 'ok' } } } },
        '/masterdata/sdav': { get: { responses: { '200': { description: 'ok' } } } },
        '/masterdata/sdav': { post: { responses: { '200': { description: 'ok' } } } },
      },
      components: { schemas: {} },
    }
    const ir = extractIR(spec as Record<string, unknown>)
    const ids = ir.operations.map(op => op.operationId)

    expect(ids).toContain('searchBgInsurance')
    expect(ids).toContain('getByIdBgInsurance')
    expect(ids).toContain('getByIdsBgInsurance')
    expect(ids).toContain('getByQueryBgInsurance')
    expect(ids).toContain('upsertSdebm')
    expect(ids).toContain('deleteSdebm')
    expect(ids).toContain('postSdav')
  })

  it('extracts inline request body schemas', () => {
    const spec = {
      paths: {
        '/users/search': {
          post: {
            operationId: 'searchUsers',
            requestBody: {
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    required: ['query'],
                    properties: {
                      query: { type: 'string' },
                      limit: { type: 'integer' },
                    },
                  },
                },
              },
            },
            responses: { '200': { description: 'ok' } },
          },
        },
      },
      components: { schemas: {} },
    }
    const ir = extractIR(spec as Record<string, unknown>)

    const bodySchema = ir.schemas.find(s => s.name === 'SearchUsersBody')
    expect(bodySchema).toBeDefined()
    expect(bodySchema!.properties).toHaveLength(2)
    expect(bodySchema!.properties.find(p => p.name === 'query')!.type).toBe('string')
    expect(bodySchema!.properties.find(p => p.name === 'query')!.required).toBe(true)
    expect(bodySchema!.properties.find(p => p.name === 'limit')!.type).toBe('number')

    const op = ir.operations[0]
    expect(op.requestBody!.ref).toBe('#/components/schemas/SearchUsersBody')
  })

  it('extracts inline response schemas', () => {
    const spec = {
      paths: {
        '/users/search': {
          post: {
            operationId: 'searchUsers',
            requestBody: { content: { 'application/json': { schema: { type: 'object' } } } },
            responses: {
              '200': {
                description: 'ok',
                content: {
                  'application/json': {
                    schema: {
                      type: 'object',
                      required: ['statusCode'],
                      properties: {
                        data: { type: 'array', items: { type: 'object' } },
                        message: { type: 'string' },
                        statusCode: { type: 'number' },
                      },
                    },
                  },
                },
              },
            },
          },
        },
      },
      components: { schemas: {} },
    }
    const ir = extractIR(spec as Record<string, unknown>)

    const respSchema = ir.schemas.find(s => s.name === 'SearchUsersResponse')
    expect(respSchema).toBeDefined()
    expect(respSchema!.properties).toHaveLength(3)
    expect(respSchema!.properties.find(p => p.name === 'statusCode')!.required).toBe(true)
    expect(respSchema!.properties.find(p => p.name === 'data')!.isArray).toBe(true)

    const op = ir.operations[0]
    expect(op.responseSchema!.ref).toBe('#/components/schemas/SearchUsersResponse')
  })

  it('does not create inline schema when $ref already exists', async () => {
    const spec = await loadSpec(resolve(__dirname, 'fixtures/petstore-oas3.yaml'))
    const ir = extractIR(spec)

    // Petstore has $ref for request body — should NOT create inline schema
    const createPet = ir.operations.find(op => op.operationId === 'createPet')
    expect(createPet!.requestBody!.ref).toBe('#/components/schemas/CreatePetBody')
    // Should still have exactly 2 schemas from components (Pet, CreatePetBody)
    expect(ir.schemas.filter(s => s.name === 'Pet' || s.name === 'CreatePetBody')).toHaveLength(2)
  })

  it('resolves internal $ref to sibling property', () => {
    const spec = {
      paths: {
        '/items': {
          post: {
            operationId: 'listItems',
            requestBody: {
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    properties: {
                      includeFields: { anyOf: [{ type: 'string' }, { type: 'array', items: { type: 'string' } }, { not: {} }] },
                      excludeFields: { $ref: '#/properties/includeFields' },
                    },
                  },
                },
              },
            },
            responses: { '200': { description: 'ok' } },
          },
        },
      },
      components: { schemas: {} },
    }
    const ir = extractIR(spec as Record<string, unknown>)

    const bodySchema = ir.schemas.find(s => s.name === 'ListItemsBody')
    expect(bodySchema).toBeDefined()
    // excludeFields should resolve to same type as includeFields, not "includeFields"
    const excludeField = bodySchema!.properties.find(p => p.name === 'excludeFields')!
    expect(excludeField.ref).toBeNull()
    expect(excludeField.type).toBe('array')
    expect(excludeField.itemType).toBe('string')
    // includeFields should be array (anyOf [string, array<string>] → array)
    const includeField = bodySchema!.properties.find(p => p.name === 'includeFields')!
    expect(includeField.type).toBe('array')
    expect(includeField.itemType).toBe('string')
  })

  it('resolves anyOf with multiple distinct types to union type', () => {
    const spec = {
      paths: {
        '/items': {
          post: {
            operationId: 'createFlexItem',
            requestBody: {
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    properties: {
                      value: { anyOf: [{ type: 'string' }, { type: 'boolean' }] },
                      data: { anyOf: [{ type: 'number' }, { type: 'string' }, { type: 'boolean' }] },
                    },
                  },
                },
              },
            },
            responses: { '200': { description: 'ok' } },
          },
        },
      },
      components: { schemas: {} },
    }
    const ir = extractIR(spec as Record<string, unknown>)
    const bodySchema = ir.schemas.find(s => s.name === 'CreateFlexItemBody')
    expect(bodySchema).toBeDefined()
    expect(bodySchema!.properties.find(p => p.name === 'value')!.type).toBe('string | boolean')
    expect(bodySchema!.properties.find(p => p.name === 'data')!.type).toBe('number | string | boolean')
  })

  it('skips version segment in operationId generation and appends version suffix', () => {
    const spec = {
      paths: {
        '/masterdata/sdkrw/v2/get-by-query': { post: { responses: { '200': { description: 'ok' } } } },
        '/api/v1/users/search': { post: { responses: { '200': { description: 'ok' } } } },
      },
      components: { schemas: {} },
    }
    const ir = extractIR(spec as Record<string, unknown>)
    const ids = ir.operations.map(op => op.operationId)
    expect(ids).toContain('getByQuerySdkrwV2')
    expect(ids).toContain('searchUsers')
  })

  it('detects circular references and breaks the cycle', () => {
    const spec = {
      paths: {},
      components: {
        schemas: {
          User: {
            type: 'object',
            required: ['id'],
            properties: {
              id: { type: 'string' },
              manager: { $ref: '#/components/schemas/User' },
            },
          },
          Node: {
            type: 'object',
            properties: {
              value: { type: 'string' },
              children: { type: 'array', items: { $ref: '#/components/schemas/Node' } },
            },
          },
        },
      },
    }
    const ir = extractIR(spec as Record<string, unknown>)

    // Should complete without infinite loop
    expect(ir.schemas).toHaveLength(2)

    const user = ir.schemas.find(s => s.name === 'User')
    expect(user).toBeDefined()
    expect(user!.properties.find(p => p.name === 'manager')!.ref).toBe('#/components/schemas/User')

    const node = ir.schemas.find(s => s.name === 'Node')
    expect(node).toBeDefined()
    const children = node!.properties.find(p => p.name === 'children')!
    expect(children.isArray).toBe(true)
  })

  it('resolves anyOf nullable types to base type', () => {
    const spec = {
      paths: {
        '/items': {
          post: {
            operationId: 'createItem',
            requestBody: {
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    properties: {
                      name: { anyOf: [{ type: 'string' }, { type: 'null' }] },
                      code: { anyOf: [{ type: 'string' }, { enum: ['null'], nullable: true }] },
                      count: { anyOf: [{ type: 'number' }, { not: {} }] },
                    },
                  },
                },
              },
            },
            responses: { '200': { description: 'ok' } },
          },
        },
      },
      components: { schemas: {} },
    }
    const ir = extractIR(spec as Record<string, unknown>)

    const bodySchema = ir.schemas.find(s => s.name === 'CreateItemBody')
    expect(bodySchema).toBeDefined()
    expect(bodySchema!.properties.find(p => p.name === 'name')!.type).toBe('string')
    expect(bodySchema!.properties.find(p => p.name === 'code')!.type).toBe('string')
    expect(bodySchema!.properties.find(p => p.name === 'count')!.type).toBe('number')
  })
})
