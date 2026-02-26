import type { IR, IROperation } from '../ir'

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1)
}

function pathToQueryKey(path: string, pathParams: Array<{ name: string }>): string {
  const segments = path.split('/').filter(Boolean)
  const parts: string[] = []

  for (const seg of segments) {
    if (seg.startsWith('{') && seg.endsWith('}')) {
      const paramName = seg.slice(1, -1)
      parts.push(`params.${paramName}`)
    } else {
      parts.push(`'${seg}'`)
    }
  }

  return `[${parts.join(', ')}]`
}

function buildFetchPath(path: string): string {
  const replaced = path.replace(/\{(\w+)\}/g, '${params.$1}')
  if (replaced.includes('${')) {
    return `\`${replaced}\``
  }
  return `'${path}'`
}

function refToTypeName(ref: string | null): string | null {
  if (!ref) return null
  return ref.split('/').pop() ?? null
}

function responseTypeName(op: IROperation): string {
  if (!op.responseSchema) return 'unknown'
  if (op.responseSchema.isArray) {
    const itemRef = refToTypeName(op.responseSchema.itemRef)
    return itemRef ? `${itemRef}[]` : 'unknown[]'
  }
  const ref = refToTypeName(op.responseSchema.ref)
  return ref ?? 'unknown'
}

function requestBodyTypeName(op: IROperation): string {
  if (!op.requestBody) return 'unknown'
  const ref = refToTypeName(op.requestBody.ref)
  return ref ?? 'unknown'
}

function generateQueryHook(op: IROperation, mock: boolean): string {
  const hookName = `use${capitalize(op.operationId)}`
  const responseType = responseTypeName(op)
  const mockName = `mock${capitalize(op.operationId)}Response`
  const hasParams = op.pathParams.length > 0 || op.queryParams.length > 0
  const paramsType = hasParams ? `${capitalize(op.operationId)}Params` : null

  const queryKey = pathToQueryKey(op.path, op.pathParams)
  const fetchPath = buildFetchPath(op.path)

  const queryParamStr = op.queryParams.length > 0
    ? `\n      const searchParams = new URLSearchParams()
${op.queryParams.map(p => `      if (params.${p.name} !== undefined) searchParams.set('${p.name}', String(params.${p.name}))`).join('\n')}
      const queryString = searchParams.toString()
      const url = queryString ? \`${op.path.replace(/\{(\w+)\}/g, '${params.$1}')}?\${queryString}\` : ${fetchPath}`
    : null

  const paramsArg = paramsType ? `params: ${paramsType}, ` : ''
  const optionsType = `Omit<UseQueryOptions<${responseType}>, 'queryKey' | 'queryFn'>`

  const lines: string[] = []
  lines.push(`export function ${hookName}(${paramsArg}options?: ${optionsType}) {`)
  if (mock) {
    lines.push(`  const { enabled: testMode } = useApiTestMode()`)
    lines.push('')
  }
  lines.push(`  return useQuery({`)
  lines.push(`    queryKey: ${queryKey},`)

  if (mock) {
    if (queryParamStr) {
      lines.push(`    queryFn: testMode`)
      lines.push(`      ? () => Promise.resolve(${mockName})`)
      lines.push(`      : () => {`)
      lines.push(queryParamStr)
      lines.push(`      return apiFetch<${responseType}>(url)`)
      lines.push(`    },`)
    } else {
      lines.push(`    queryFn: testMode`)
      lines.push(`      ? () => Promise.resolve(${mockName})`)
      lines.push(`      : () => apiFetch<${responseType}>(${fetchPath}),`)
    }
  } else {
    if (queryParamStr) {
      lines.push(`    queryFn: () => {`)
      lines.push(queryParamStr)
      lines.push(`      return apiFetch<${responseType}>(url)`)
      lines.push(`    },`)
    } else {
      lines.push(`    queryFn: () => apiFetch<${responseType}>(${fetchPath}),`)
    }
  }

  lines.push(`    ...options,`)
  lines.push(`  })`)
  lines.push(`}`)
  return lines.join('\n')
}

function generateMutationHook(op: IROperation, mock: boolean): string {
  const hookName = `use${capitalize(op.operationId)}`
  const responseType = responseTypeName(op)
  const bodyType = requestBodyTypeName(op)
  const mockName = `mock${capitalize(op.operationId)}Response`
  const fetchPath = buildFetchPath(op.path)
  const method = op.method.toUpperCase()

  const hasParams = op.pathParams.length > 0
  const paramsType = hasParams ? `${capitalize(op.operationId)}Params` : null
  const paramsArg = paramsType ? `params: ${paramsType}, ` : ''

  const optionsType = `Omit<UseMutationOptions<${responseType}, Error, ${bodyType}>, 'mutationFn'>`

  const lines: string[] = []
  lines.push(`export function ${hookName}(${paramsArg}options?: ${optionsType}) {`)
  if (mock) {
    lines.push(`  const { enabled: testMode } = useApiTestMode()`)
    lines.push('')
    lines.push(`  return useMutation({`)
    lines.push(`    mutationFn: testMode`)
    lines.push(`      ? () => Promise.resolve(${mockName})`)
    lines.push(`      : (body: ${bodyType}) => apiFetch<${responseType}>(${fetchPath}, {`)
    lines.push(`          method: '${method}',`)
    lines.push(`          body: JSON.stringify(body),`)
    lines.push(`        }),`)
  } else {
    lines.push(`  return useMutation({`)
    lines.push(`    mutationFn: (body: ${bodyType}) => apiFetch<${responseType}>(${fetchPath}, {`)
    lines.push(`        method: '${method}',`)
    lines.push(`        body: JSON.stringify(body),`)
    lines.push(`      }),`)
  }
  lines.push(`    ...options,`)
  lines.push(`  })`)
  lines.push(`}`)
  return lines.join('\n')
}

function collectImportedTypes(ir: IR): string[] {
  const types = new Set<string>()

  for (const op of ir.operations) {
    if (op.responseSchema?.ref) {
      const name = refToTypeName(op.responseSchema.ref)
      if (name) types.add(name)
    }
    if (op.responseSchema?.isArray && op.responseSchema.itemRef) {
      const name = refToTypeName(op.responseSchema.itemRef)
      if (name) types.add(name)
    }
    if (op.requestBody?.ref) {
      const name = refToTypeName(op.requestBody.ref)
      if (name) types.add(name)
    }
    if (op.pathParams.length > 0 || op.queryParams.length > 0) {
      types.add(`${capitalize(op.operationId)}Params`)
    }
  }

  return [...types]
}

function collectMockImports(ir: IR): string[] {
  const mocks = new Set<string>()
  for (const op of ir.operations) {
    if (op.responseSchema) {
      mocks.add(`mock${capitalize(op.operationId)}Response`)
    }
  }
  return [...mocks]
}

function generateHooks(ir: IR, options?: { mock?: boolean; providerImportPath?: string; apiFetchImportPath?: string }): string {
  const mock = options?.mock ?? true
  const providerImportPath = options?.providerImportPath ?? './test-mode-provider'
  const apiFetchImportPath = options?.apiFetchImportPath
  const parts: string[] = []
  const queryOps = ir.operations.filter(op => op.method === 'get')
  const mutationOps = ir.operations.filter(op => op.method !== 'get')

  const tanstackImports: string[] = []
  if (queryOps.length > 0) tanstackImports.push('useQuery', 'type UseQueryOptions')
  if (mutationOps.length > 0) tanstackImports.push('useMutation', 'type UseMutationOptions')

  const typeImports = collectImportedTypes(ir)

  parts.push('/* eslint-disable */')
  parts.push('/* This file is auto-generated by apigen. Do not edit. */')
  parts.push('')
  parts.push(`import { ${tanstackImports.join(', ')} } from '@tanstack/react-query'`)
  if (mock) {
    const mockImports = collectMockImports(ir)
    parts.push(`import { useApiTestMode } from '${providerImportPath}'`)
    parts.push(`import { ${mockImports.join(', ')} } from './mocks'`)
  }
  if (typeImports.length > 0) {
    parts.push(`import type { ${typeImports.join(', ')} } from './types'`)
  }
  if (apiFetchImportPath) {
    parts.push(`import { apiFetch } from '${apiFetchImportPath}'`)
  }
  parts.push('')

  if (!apiFetchImportPath) {
    parts.push(`function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {`)
    parts.push(`  return fetch(path, {`)
    parts.push(`    headers: { 'Content-Type': 'application/json' },`)
    parts.push(`    ...init,`)
    parts.push(`  }).then(res => {`)
    parts.push(`    if (!res.ok) throw new Error(\`\${res.status} \${res.statusText}\`)`)
    parts.push(`    return res.json() as Promise<T>`)
    parts.push(`  })`)
    parts.push(`}`)
    parts.push('')
  }

  for (const op of queryOps) {
    parts.push(generateQueryHook(op, mock))
    parts.push('')
  }

  for (const op of mutationOps) {
    parts.push(generateMutationHook(op, mock))
    parts.push('')
  }

  return parts.join('\n')
}

export { generateHooks }
