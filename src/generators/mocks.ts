import { faker } from '@faker-js/faker'
import type { IR, IRSchema, IROperation, IRProperty, IRSchemaRef } from '../ir'

// Fixed seed for deterministic output across runs
faker.seed(42)

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1)
}

function fakerValueForField(name: string, type: string): string {
  const lower = name.toLowerCase()

  // Name-based heuristics (checked first)
  if (lower === 'id' || lower.endsWith('id')) return `'${faker.string.uuid()}'`
  if (lower === 'email' || lower.endsWith('email')) return `'${faker.internet.email()}'`
  if (lower === 'phone' || lower === 'fax' || lower.endsWith('phone')) return `'${faker.phone.number()}'`
  if (lower === 'name' || lower === 'shortname' || lower === 'fullname' || lower === 'displayname') return `'${faker.person.fullName()}'`
  if (lower === 'firstname' || lower === 'givenname') return `'${faker.person.firstName()}'`
  if (lower === 'lastname' || lower === 'surname' || lower === 'familyname') return `'${faker.person.lastName()}'`
  if (lower === 'username') return `'${faker.internet.username()}'`
  if (lower === 'street' || lower === 'streetname' || lower === 'address') return `'${faker.location.street()}'`
  if (lower === 'postcode' || lower === 'zipcode' || lower === 'postalcode' || lower === 'zip') return `'${faker.location.zipCode()}'`
  if (lower === 'city' || lower === 'location') return `'${faker.location.city()}'`
  if (lower === 'country') return `'${faker.location.country()}'`
  if (lower === 'countrycode') return `'${faker.location.countryCode()}'`
  if (lower === 'url' || lower === 'website' || lower === 'homepage' || lower.endsWith('url')) return `'${faker.internet.url()}'`
  if (lower === 'description' || lower === 'summary' || lower === 'bio') return `'${faker.lorem.sentence()}'`
  if (lower === 'message' || lower === 'comment' || lower === 'note' || lower === 'notes') return `'${faker.lorem.sentence()}'`
  if (lower === 'title' || lower === 'subject') return `'${faker.lorem.words(3)}'`
  if (lower === 'statuscode') return '200'
  if (lower === 'year') return `${faker.date.recent().getFullYear()}`
  if (lower === 'quarter') return `${faker.number.int({ min: 1, max: 4 })}`
  if (lower === 'month') return `${faker.number.int({ min: 1, max: 12 })}`
  if (lower === 'day') return `${faker.number.int({ min: 1, max: 28 })}`
  if (lower === 'page' || lower === 'pagenumber') return `${faker.number.int({ min: 1, max: 10 })}`
  if (lower === 'limit' || lower === 'pagesize' || lower === 'size') return `${faker.number.int({ min: 10, max: 50 })}`
  if (lower === 'total' || lower === 'count' || lower === 'totalcount') return `${faker.number.int({ min: 1, max: 100 })}`
  if (lower === 'query' || lower === 'search' || lower === 'keyword') return `'${faker.lorem.word()}'`
  if (lower === 'tag' || lower === 'label' || lower === 'category') return `'${faker.lorem.word()}'`
  if (lower === 'status' || lower === 'state') return `'active'`
  if (lower === 'type' || lower === 'kind') return `'default'`
  if (lower === 'code') return `'${faker.string.alphanumeric(6).toUpperCase()}'`
  if (lower === 'token') return `'${faker.string.alphanumeric(32)}'`
  if (lower === 'password' || lower === 'secret') return `'${faker.internet.password()}'`
  if (lower === 'avatar' || lower === 'image' || lower === 'photo' || lower === 'picture') return `'${faker.image.url()}'`
  if (lower === 'color' || lower === 'colour') return `'${faker.color.human()}'`
  if (lower === 'createdat' || lower === 'updatedat' || lower === 'date' || lower === 'timestamp' || lower.endsWith('date') || lower.endsWith('at')) {
    if (type === 'number') return `${faker.date.recent().getTime()}`
    return `'${faker.date.recent().toISOString()}'`
  }

  // Type-based fallback
  switch (type) {
    case 'string': return `'${faker.lorem.word()}'`
    case 'number': return `${faker.number.int({ min: 1, max: 100 })}`
    case 'boolean': return `${faker.datatype.boolean()}`
    case 'object': return '{}'
    case 'unknown': return 'null as unknown'
    default: return 'null as unknown'
  }
}

function mockPropertyValue(prop: IRProperty, schemas: IRSchema[]): string {
  if (prop.ref) {
    const refName = prop.ref.split('/').pop()
    return `mock${refName}`
  }
  if (prop.isArray) {
    if (prop.itemType) return `[${fakerValueForField(prop.name, prop.itemType)}]`
    return '[]'
  }
  if (prop.enumValues && prop.enumValues.length > 0) {
    return `'${prop.enumValues[0]}'`
  }
  return fakerValueForField(prop.name, prop.type)
}

function refToSchemaName(ref: string | null): string | null {
  if (!ref) return null
  return ref.split('/').pop() ?? null
}

function generateSchemaMock(schema: IRSchema, allSchemas: IRSchema[]): string {
  const lines: string[] = []
  lines.push(`export const mock${schema.name}: ${schema.name} = {`)
  for (const prop of schema.properties) {
    lines.push(`  ${prop.name}: ${mockPropertyValue(prop, allSchemas)},`)
  }
  lines.push('}')
  return lines.join('\n')
}

function generateResponseMock(op: IROperation, emittedNames: Set<string>): string | null {
  if (!op.responseSchema) return null

  const name = `mock${capitalize(op.operationId)}Response`

  // Skip if already emitted by the schema mock loop
  if (emittedNames.has(name)) return null

  if (op.responseSchema.isArray) {
    const itemRef = refToSchemaName(op.responseSchema.itemRef)
    if (itemRef) {
      return `export const ${name}: ${itemRef}[] = [mock${itemRef}]`
    }
    return `export const ${name}: unknown[] = []`
  }

  const ref = refToSchemaName(op.responseSchema.ref)
  if (ref) {
    return `export const ${name}: ${ref} = mock${ref}`
  }

  return null
}

function generateMocks(ir: IR): string {
  const parts: string[] = []
  const usedTypes = new Set<string>()
  const emittedNames = new Set<string>()

  parts.push('/* eslint-disable */')
  parts.push('/* This file is auto-generated by apigen. Do not edit. */')
  parts.push('')

  for (const schema of ir.schemas) {
    usedTypes.add(schema.name)
  }

  if (usedTypes.size > 0) {
    const importLine = `import type { ${[...usedTypes].join(', ')} } from './types'`
    parts.push(importLine)
    parts.push('')
  }

  for (const schema of ir.schemas) {
    const mockName = `mock${schema.name}`
    emittedNames.add(mockName)
    parts.push(generateSchemaMock(schema, ir.schemas))
    parts.push('')
  }

  for (const op of ir.operations) {
    const responseMock = generateResponseMock(op, emittedNames)
    if (responseMock) {
      parts.push(responseMock)
      parts.push('')
    }
  }

  return parts.join('\n')
}

export { generateMocks }
