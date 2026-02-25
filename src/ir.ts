interface IRParam {
  name: string
  type: string
  required: boolean
  location: 'path' | 'query'
}

interface IRProperty {
  name: string
  type: string
  required: boolean
  isArray: boolean
  itemType: string | null
  ref: string | null
  enumValues: string[] | null
}

interface IRSchema {
  name: string
  properties: IRProperty[]
  required: string[]
}

interface IRSchemaRef {
  type: string
  ref: string | null
  isArray: boolean
  itemRef: string | null
}

interface IROperation {
  operationId: string
  method: string
  path: string
  pathParams: IRParam[]
  queryParams: IRParam[]
  requestBody: IRSchemaRef | null
  responseSchema: IRSchemaRef | null
  tags: string[]
}

interface IR {
  operations: IROperation[]
  schemas: IRSchema[]
}

function mapOpenApiType(schema: Record<string, unknown>): string {
  const type = schema.type as string | undefined
  const format = schema.format as string | undefined

  if (type === 'integer' || type === 'number') return 'number'
  if (type === 'boolean') return 'boolean'
  if (type === 'string') {
    if (format === 'date' || format === 'date-time') return 'string'
    return 'string'
  }
  if (type === 'array') return 'array'
  if (type === 'object') return 'object'
  return 'unknown'
}

function extractSchemaRef(schema: Record<string, unknown> | undefined): IRSchemaRef | null {
  if (!schema) return null

  const ref = (schema.$ref as string) ?? null
  const type = (schema.type as string) ?? 'object'

  if (type === 'array') {
    const items = schema.items as Record<string, unknown> | undefined
    return {
      type: 'array',
      ref: null,
      isArray: true,
      itemRef: items?.$ref as string ?? null,
    }
  }

  return {
    type: mapOpenApiType(schema),
    ref,
    isArray: false,
    itemRef: null,
  }
}

function extractIR(spec: Record<string, unknown>): IR {
  const paths = (spec.paths ?? {}) as Record<string, Record<string, unknown>>
  const components = (spec.components ?? {}) as Record<string, unknown>
  const schemasDef = (components.schemas ?? {}) as Record<string, Record<string, unknown>>

  const operations: IROperation[] = []
  const schemas: IRSchema[] = []

  const methods = ['get', 'post', 'put', 'delete', 'patch'] as const

  for (const [path, pathItem] of Object.entries(paths)) {
    for (const method of methods) {
      const op = pathItem[method] as Record<string, unknown> | undefined
      if (!op) continue

      const operationId = (op.operationId as string) ?? `${method}${path.replace(/[^a-zA-Z]/g, '_')}`
      const parameters = (op.parameters ?? []) as Array<Record<string, unknown>>

      const pathParams: IRParam[] = []
      const queryParams: IRParam[] = []

      for (const param of parameters) {
        const paramSchema = (param.schema ?? {}) as Record<string, unknown>
        const irParam: IRParam = {
          name: param.name as string,
          type: mapOpenApiType(paramSchema),
          required: (param.required as boolean) ?? false,
          location: param.in as 'path' | 'query',
        }
        if (param.in === 'path') pathParams.push(irParam)
        if (param.in === 'query') queryParams.push(irParam)
      }

      let requestBody: IRSchemaRef | null = null
      const reqBody = op.requestBody as Record<string, unknown> | undefined
      if (reqBody) {
        const content = reqBody.content as Record<string, Record<string, unknown>> | undefined
        const jsonContent = content?.['application/json']
        if (jsonContent) {
          requestBody = extractSchemaRef(jsonContent.schema as Record<string, unknown>)
        }
      }

      let responseSchema: IRSchemaRef | null = null
      const responses = (op.responses ?? {}) as Record<string, Record<string, unknown>>
      const successResponse = responses['200'] ?? responses['201'] ?? responses['default']
      if (successResponse) {
        const content = successResponse.content as Record<string, Record<string, unknown>> | undefined
        const jsonContent = content?.['application/json']
        if (jsonContent) {
          responseSchema = extractSchemaRef(jsonContent.schema as Record<string, unknown>)
        }
      }

      operations.push({
        operationId,
        method,
        path,
        pathParams,
        queryParams,
        requestBody,
        responseSchema,
        tags: (op.tags ?? []) as string[],
      })
    }
  }

  for (const [name, schemaDef] of Object.entries(schemasDef)) {
    const props = (schemaDef.properties ?? {}) as Record<string, Record<string, unknown>>
    const required = (schemaDef.required ?? []) as string[]

    const properties: IRProperty[] = Object.entries(props).map(([propName, propSchema]) => {
      const isArray = propSchema.type === 'array'
      const items = propSchema.items as Record<string, unknown> | undefined
      return {
        name: propName,
        type: mapOpenApiType(propSchema),
        required: required.includes(propName),
        isArray,
        itemType: isArray && items ? mapOpenApiType(items) : null,
        ref: (propSchema.$ref as string) ?? null,
        enumValues: (propSchema.enum as string[]) ?? null,
      }
    })

    schemas.push({ name, properties, required })
  }

  return { operations, schemas }
}

export { extractIR }
export type { IR, IROperation, IRSchema, IRParam, IRProperty, IRSchemaRef }
