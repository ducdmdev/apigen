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
  // Handle anyOf (common Zod pattern for nullable types)
  if (Array.isArray(schema.anyOf)) {
    const variants = schema.anyOf as Record<string, unknown>[]
    const realTypes = variants.filter(v => {
      // Filter out null sentinels: {enum: ["null"], nullable: true} or {not: {}}
      if (v.nullable && Array.isArray(v.enum) && (v.enum as unknown[]).includes('null')) return false
      if (v.not !== undefined) return false
      // Filter out explicit null type
      if (v.type === 'null') return false
      return true
    })
    if (realTypes.length === 1) return mapOpenApiType(realTypes[0])
    // Multiple real types with same base → use that type
    const mapped = realTypes.map(v => mapOpenApiType(v))
    if (new Set(mapped).size === 1) return mapped[0]
    // Zod pattern: anyOf [string, array<string>] → treat as array
    const hasArray = realTypes.find(v => v.type === 'array')
    if (hasArray && realTypes.length === 2) return 'array'
    return mapped.join(' | ')
  }

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

function kebabToPascal(s: string): string {
  return s.split('-').map(p => p.charAt(0).toUpperCase() + p.slice(1)).join('')
}

const actionSuffixes: Record<string, string> = {
  'search': 'search',
  'get-by-id': 'getById',
  'get-by-ids': 'getByIds',
  'get-by-query': 'getByQuery',
  'upsert': 'upsert',
  'delete': 'delete',
  'create': 'create',
  'update': 'update',
}

function generateOperationId(method: string, path: string): string {
  const segments = path.split('/').filter(s => s && !s.startsWith('{'))
  if (segments.length === 0) return `${method}Root`

  const lastSegment = segments[segments.length - 1]
  const action = actionSuffixes[lastSegment]

  if (action && segments.length >= 2) {
    const resource = kebabToPascal(segments[segments.length - 2])
    return `${action}${resource}`
  }

  // No known action suffix — use method as verb
  const resource = kebabToPascal(lastSegment)
  const methodVerb = method === 'get' ? 'list' : method
  return `${methodVerb}${resource}`
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

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1)
}

function extractArrayItems(schema: Record<string, unknown>): Record<string, unknown> | undefined {
  // Direct array — items on the schema itself
  if (schema.type === 'array') return schema.items as Record<string, unknown> | undefined
  // anyOf with array variant — dig into the array variant's items
  if (Array.isArray(schema.anyOf)) {
    const arrayVariant = (schema.anyOf as Record<string, unknown>[]).find(v => v.type === 'array')
    if (arrayVariant) return arrayVariant.items as Record<string, unknown> | undefined
  }
  return undefined
}

function resolveInternalRef(ref: string, allProps: Record<string, Record<string, unknown>>): Record<string, unknown> | null {
  // Handle internal $ref like "#/properties/includeFields"
  const match = ref.match(/^#\/properties\/(.+)$/)
  if (!match) return null
  return allProps[match[1]] ?? null
}

function extractInlineSchema(name: string, schema: Record<string, unknown>): IRSchema | null {
  const props = (schema.properties ?? {}) as Record<string, Record<string, unknown>>
  if (Object.keys(props).length === 0) return null

  const required = (schema.required ?? []) as string[]
  const properties: IRProperty[] = Object.entries(props).map(([propName, propSchema]) => {
    // Resolve internal $ref (Zod pattern: {$ref: "#/properties/otherField"})
    let resolved = propSchema
    if (propSchema.$ref && typeof propSchema.$ref === 'string') {
      const target = resolveInternalRef(propSchema.$ref as string, props)
      if (target) resolved = target
    }

    const isArray = resolved.type === 'array' || mapOpenApiType(resolved) === 'array'
    let items = extractArrayItems(resolved)
    // Resolve internal $ref in array items (e.g. items: {$ref: "#/properties/otherField"})
    if (items?.$ref && typeof items.$ref === 'string') {
      const itemTarget = resolveInternalRef(items.$ref as string, props)
      if (itemTarget) items = itemTarget
    }
    // Only keep $ref if it's a components schema ref, not an internal one
    const ref = resolved.$ref as string | undefined
    const isComponentRef = ref && ref.startsWith('#/components/')
    return {
      name: propName,
      type: mapOpenApiType(resolved),
      required: required.includes(propName),
      isArray,
      itemType: isArray && items ? mapOpenApiType(items) : null,
      ref: isComponentRef ? ref : null,
      enumValues: (resolved.enum as string[]) ?? null,
    }
  })

  return { name, properties, required }
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

      const operationId = (op.operationId as string) ?? generateOperationId(method, path)
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
          const reqSchema = jsonContent.schema as Record<string, unknown> | undefined
          if (reqSchema && !reqSchema.$ref && reqSchema.properties) {
            const schemaName = `${capitalize(operationId)}Body`
            const inlineSchema = extractInlineSchema(schemaName, reqSchema)
            if (inlineSchema) {
              schemas.push(inlineSchema)
              requestBody = { type: 'object', ref: `#/components/schemas/${schemaName}`, isArray: false, itemRef: null }
            }
          } else {
            requestBody = extractSchemaRef(reqSchema)
          }
        }
      }

      let responseSchema: IRSchemaRef | null = null
      const responses = (op.responses ?? {}) as Record<string, Record<string, unknown>>
      const successResponse = responses['200'] ?? responses['201'] ?? responses['default']
      if (successResponse) {
        const content = successResponse.content as Record<string, Record<string, unknown>> | undefined
        const jsonContent = content?.['application/json']
        if (jsonContent) {
          const respSchema = jsonContent.schema as Record<string, unknown> | undefined
          if (respSchema && !respSchema.$ref && respSchema.properties) {
            const schemaName = `${capitalize(operationId)}Response`
            const inlineSchema = extractInlineSchema(schemaName, respSchema)
            if (inlineSchema) {
              schemas.push(inlineSchema)
              responseSchema = { type: 'object', ref: `#/components/schemas/${schemaName}`, isArray: false, itemRef: null }
            }
          } else {
            responseSchema = extractSchemaRef(respSchema)
          }
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
      const isArray = propSchema.type === 'array' || mapOpenApiType(propSchema) === 'array'
      const items = extractArrayItems(propSchema)
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
