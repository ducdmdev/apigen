import { mkdirSync, writeFileSync } from 'fs'
import { join } from 'path'
import type { IR, IROperation, IRSchema } from './ir'
import { generateTypes } from './generators/types'
import { generateHooks } from './generators/hooks'
import { generateMocks } from './generators/mocks'
import { generateProvider } from './generators/provider'
import { generateIndexFile, generateRootIndexFile } from './generators/index-file'
import { generateApiFetch } from './generators/api-fetch'

function tagSlug(tag: string): string {
  return tag.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
}

function collectSchemaNamesForOperations(ops: IROperation[]): Set<string> {
  const names = new Set<string>()
  for (const op of ops) {
    if (op.responseSchema?.ref) {
      const name = op.responseSchema.ref.split('/').pop()
      if (name) names.add(name)
    }
    if (op.responseSchema?.isArray && op.responseSchema.itemRef) {
      const name = op.responseSchema.itemRef.split('/').pop()
      if (name) names.add(name)
    }
    if (op.requestBody?.ref) {
      const name = op.requestBody.ref.split('/').pop()
      if (name) names.add(name)
    }
  }
  return names
}

function groupOperationsByTag(operations: IROperation[]): Map<string, IROperation[]> {
  const groups = new Map<string, IROperation[]>()
  for (const op of operations) {
    const tag = op.tags.length > 0 ? op.tags[0] : 'common'
    const slug = tagSlug(tag)
    if (!groups.has(slug)) groups.set(slug, [])
    groups.get(slug)!.push(op)
  }
  return groups
}

function buildSubsetIR(ops: IROperation[], allSchemas: IRSchema[]): IR {
  const neededNames = collectSchemaNamesForOperations(ops)
  const schemas = allSchemas.filter(s => neededNames.has(s.name))
  return { operations: ops, schemas }
}

function writeFlat(ir: IR, outputDir: string, mock: boolean, opts?: { baseURL?: string; apiFetchImportPath?: string }): void {
  mkdirSync(outputDir, { recursive: true })

  writeFileSync(join(outputDir, 'types.ts'), generateTypes(ir), 'utf8')
  writeFileSync(join(outputDir, 'hooks.ts'), generateHooks(ir, { mock, baseURL: opts?.baseURL, apiFetchImportPath: opts?.apiFetchImportPath }), 'utf8')
  if (mock) {
    writeFileSync(join(outputDir, 'mocks.ts'), generateMocks(ir), 'utf8')
    writeFileSync(join(outputDir, 'test-mode-provider.tsx'), generateProvider(), 'utf8')
  }
  writeFileSync(join(outputDir, 'index.ts'), generateIndexFile({ mock }), 'utf8')
}

function writeSplit(ir: IR, outputDir: string, mock: boolean, opts?: { baseURL?: string }): void {
  mkdirSync(outputDir, { recursive: true })

  const groups = groupOperationsByTag(ir.operations)
  const tagSlugs: string[] = [...groups.keys()].sort()

  // Write shared provider at root
  if (mock) {
    writeFileSync(join(outputDir, 'test-mode-provider.tsx'), generateProvider(), 'utf8')
  }

  // Write shared api-fetch at root
  writeFileSync(join(outputDir, 'api-fetch.ts'), generateApiFetch({ baseURL: opts?.baseURL }), 'utf8')

  // Write per-tag feature folders
  for (const slug of tagSlugs) {
    const ops = groups.get(slug)!
    const subsetIR = buildSubsetIR(ops, ir.schemas)
    const featureDir = join(outputDir, slug)
    mkdirSync(featureDir, { recursive: true })

    writeFileSync(join(featureDir, 'types.ts'), generateTypes(subsetIR), 'utf8')
    writeFileSync(
      join(featureDir, 'hooks.ts'),
      generateHooks(subsetIR, { mock, providerImportPath: '../test-mode-provider', apiFetchImportPath: '../api-fetch' }),
      'utf8',
    )
    if (mock) {
      writeFileSync(join(featureDir, 'mocks.ts'), generateMocks(subsetIR), 'utf8')
    }
    writeFileSync(join(featureDir, 'index.ts'), generateIndexFile({ mock, includeProvider: false }), 'utf8')
  }

  // Write root index that re-exports all feature folders
  writeFileSync(
    join(outputDir, 'index.ts'),
    generateRootIndexFile(tagSlugs, { mock }),
    'utf8',
  )
}

function writeGeneratedFiles(ir: IR, outputDir: string, options?: { mock?: boolean; split?: boolean; baseURL?: string; apiFetchImportPath?: string }): void {
  const mock = options?.mock ?? true
  const split = options?.split ?? false
  const baseURL = options?.baseURL
  const apiFetchImportPath = options?.apiFetchImportPath

  if (split) {
    writeSplit(ir, outputDir, mock, { baseURL })
  } else {
    writeFlat(ir, outputDir, mock, { baseURL, apiFetchImportPath })
  }
}

export { writeGeneratedFiles }
