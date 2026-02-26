import { describe, it, expect } from 'vitest'
import { resolve, join } from 'path'
import { mkdtempSync, readFileSync, rmSync, existsSync } from 'fs'
import { tmpdir } from 'os'
import { loadSpec } from '../src/loader'
import { extractIR } from '../src/ir'
import { writeGeneratedFiles } from '../src/writer'

describe('e2e: Swagger 2.0 petstore', () => {
  it('generates valid output from Swagger 2.0 spec', async () => {
    const spec = await loadSpec(resolve(__dirname, 'fixtures/petstore-swagger2.yaml'))
    const ir = extractIR(spec)
    const outDir = mkdtempSync(join(tmpdir(), 'oqf-e2e-'))

    try {
      writeGeneratedFiles(ir, outDir)

      const types = readFileSync(join(outDir, 'types.ts'), 'utf8')
      expect(types).toContain('export interface Pet')

      const hooks = readFileSync(join(outDir, 'hooks.ts'), 'utf8')
      expect(hooks).toContain('useListPets')
      expect(hooks).toContain('useCreatePet')
      expect(hooks).toContain('useGetPet')
      expect(hooks).toContain('useApiTestMode')

      const mocks = readFileSync(join(outDir, 'mocks.ts'), 'utf8')
      expect(mocks).toContain('mockPet')

      const provider = readFileSync(join(outDir, 'test-mode-provider.tsx'), 'utf8')
      expect(provider).toContain('ApiTestModeProvider')
    } finally {
      rmSync(outDir, { recursive: true })
    }
  })
})

describe('e2e: OpenAPI 3.0 petstore', () => {
  it('generates valid output from OpenAPI 3.0 spec', async () => {
    const spec = await loadSpec(resolve(__dirname, 'fixtures/petstore-oas3.yaml'))
    const ir = extractIR(spec)
    const outDir = mkdtempSync(join(tmpdir(), 'oqf-e2e-'))

    try {
      writeGeneratedFiles(ir, outDir)

      const types = readFileSync(join(outDir, 'types.ts'), 'utf8')
      expect(types).toContain('export interface Pet')
      expect(types).toContain('export interface CreatePetBody')

      const hooks = readFileSync(join(outDir, 'hooks.ts'), 'utf8')
      expect(hooks).toContain('useQuery')
      expect(hooks).toContain('useMutation')
    } finally {
      rmSync(outDir, { recursive: true })
    }
  })
})

describe('e2e: inline schemas (masterdata-style)', () => {
  it('generates typed output from spec with no components.schemas and no operationId', async () => {
    const spec = await loadSpec(resolve(__dirname, 'fixtures/inline-schemas.yaml'))
    const ir = extractIR(spec)
    const outDir = mkdtempSync(join(tmpdir(), 'oqf-e2e-'))

    try {
      writeGeneratedFiles(ir, outDir)

      const types = readFileSync(join(outDir, 'types.ts'), 'utf8')
      // Inline request body schemas become interfaces
      expect(types).toContain('export interface SearchBgInsuranceBody')
      expect(types).toContain('query: string')
      // Inline response schemas become interfaces
      expect(types).toContain('export interface SearchBgInsuranceResponse')
      expect(types).toContain('statusCode: number')
      // anyOf nullable resolved to base type
      expect(types).toContain('year?: number')

      const hooks = readFileSync(join(outDir, 'hooks.ts'), 'utf8')
      // Smart operationId: search suffix
      expect(hooks).toContain('useSearchBgInsurance')
      // Smart operationId: get-by-id suffix
      expect(hooks).toContain('useGetByIdBgInsurance')
      // Smart operationId: upsert suffix
      expect(hooks).toContain('useUpsertSdebm')
      // Smart operationId: list for GET
      expect(hooks).toContain('useListSdav')

      const mocks = readFileSync(join(outDir, 'mocks.ts'), 'utf8')
      // Mocks generated for inline schemas
      expect(mocks).toContain('mockSearchBgInsuranceBody')
      expect(mocks).toContain('mockSearchBgInsuranceResponse')
      // No empty import
      expect(mocks).not.toContain('import type {  }')
    } finally {
      rmSync(outDir, { recursive: true })
    }
  })
})

describe('e2e: --split flag', () => {
  it('generates per-tag feature folders when split is enabled', async () => {
    const spec = await loadSpec(resolve(__dirname, 'fixtures/tagged-api.yaml'))
    const ir = extractIR(spec)
    const outDir = mkdtempSync(join(tmpdir(), 'oqf-e2e-'))

    try {
      writeGeneratedFiles(ir, outDir, { split: true })

      // Root should have test-mode-provider and root index
      expect(existsSync(join(outDir, 'test-mode-provider.tsx'))).toBe(true)
      expect(existsSync(join(outDir, 'index.ts'))).toBe(true)

      // Should NOT have flat types/hooks/mocks at root
      expect(existsSync(join(outDir, 'types.ts'))).toBe(false)
      expect(existsSync(join(outDir, 'hooks.ts'))).toBe(false)
      expect(existsSync(join(outDir, 'mocks.ts'))).toBe(false)

      // Users tag folder
      expect(existsSync(join(outDir, 'users', 'types.ts'))).toBe(true)
      expect(existsSync(join(outDir, 'users', 'hooks.ts'))).toBe(true)
      expect(existsSync(join(outDir, 'users', 'mocks.ts'))).toBe(true)
      expect(existsSync(join(outDir, 'users', 'index.ts'))).toBe(true)

      const usersTypes = readFileSync(join(outDir, 'users', 'types.ts'), 'utf8')
      expect(usersTypes).toContain('export interface User')
      expect(usersTypes).not.toContain('export interface Post')

      const usersHooks = readFileSync(join(outDir, 'users', 'hooks.ts'), 'utf8')
      expect(usersHooks).toContain('useListUsers')
      expect(usersHooks).toContain('useCreateUser')
      expect(usersHooks).not.toContain('useListPosts')
      // Hooks import provider from parent directory
      expect(usersHooks).toContain("from '../test-mode-provider'")

      // Posts tag folder
      expect(existsSync(join(outDir, 'posts', 'types.ts'))).toBe(true)
      const postsHooks = readFileSync(join(outDir, 'posts', 'hooks.ts'), 'utf8')
      expect(postsHooks).toContain('useListPosts')
      expect(postsHooks).not.toContain('useListUsers')

      // Common folder for untagged operations
      expect(existsSync(join(outDir, 'common', 'hooks.ts'))).toBe(true)
      const commonHooks = readFileSync(join(outDir, 'common', 'hooks.ts'), 'utf8')
      expect(commonHooks).toContain('useHealthCheck')

      // Root index re-exports all feature folders
      const rootIndex = readFileSync(join(outDir, 'index.ts'), 'utf8')
      expect(rootIndex).toContain("export * from './common'")
      expect(rootIndex).toContain("export * from './posts'")
      expect(rootIndex).toContain("export * from './users'")
      expect(rootIndex).toContain("export * from './test-mode-provider'")

      // Per-tag index should NOT re-export test-mode-provider (it lives at root only)
      const usersIndex = readFileSync(join(outDir, 'users', 'index.ts'), 'utf8')
      expect(usersIndex).not.toContain('test-mode-provider')
      expect(usersIndex).toContain("export * from './types'")
      expect(usersIndex).toContain("export * from './hooks'")
      expect(usersIndex).toContain("export * from './mocks'")

      // Shared api-fetch.ts at root
      expect(existsSync(join(outDir, 'api-fetch.ts'))).toBe(true)
      const apiFetchFile = readFileSync(join(outDir, 'api-fetch.ts'), 'utf8')
      expect(apiFetchFile).toContain('export function apiFetch')

      // Per-tag hooks should import from shared api-fetch, not inline it
      const usersHooksForApiFetch = readFileSync(join(outDir, 'users', 'hooks.ts'), 'utf8')
      expect(usersHooksForApiFetch).toContain("from '../api-fetch'")
      expect(usersHooksForApiFetch).not.toMatch(/^function apiFetch/m)
    } finally {
      rmSync(outDir, { recursive: true })
    }
  })

  it('generates split output without mocks when mock is false', async () => {
    const spec = await loadSpec(resolve(__dirname, 'fixtures/tagged-api.yaml'))
    const ir = extractIR(spec)
    const outDir = mkdtempSync(join(tmpdir(), 'oqf-e2e-'))

    try {
      writeGeneratedFiles(ir, outDir, { split: true, mock: false })

      // Root should not have provider
      expect(existsSync(join(outDir, 'test-mode-provider.tsx'))).toBe(false)

      // Feature folders have types and hooks but no mocks
      expect(existsSync(join(outDir, 'users', 'types.ts'))).toBe(true)
      expect(existsSync(join(outDir, 'users', 'hooks.ts'))).toBe(true)
      expect(existsSync(join(outDir, 'users', 'mocks.ts'))).toBe(false)

      const hooks = readFileSync(join(outDir, 'users', 'hooks.ts'), 'utf8')
      expect(hooks).not.toContain('useApiTestMode')
    } finally {
      rmSync(outDir, { recursive: true })
    }
  })
})

describe('e2e: --no-mock flag', () => {
  it('generates only types, hooks, and index when mock is false', async () => {
    const spec = await loadSpec(resolve(__dirname, 'fixtures/petstore-oas3.yaml'))
    const ir = extractIR(spec)
    const outDir = mkdtempSync(join(tmpdir(), 'oqf-e2e-'))

    try {
      writeGeneratedFiles(ir, outDir, { mock: false })

      expect(existsSync(join(outDir, 'types.ts'))).toBe(true)
      expect(existsSync(join(outDir, 'hooks.ts'))).toBe(true)
      expect(existsSync(join(outDir, 'index.ts'))).toBe(true)
      expect(existsSync(join(outDir, 'mocks.ts'))).toBe(false)
      expect(existsSync(join(outDir, 'test-mode-provider.tsx'))).toBe(false)

      const hooks = readFileSync(join(outDir, 'hooks.ts'), 'utf8')
      expect(hooks).toContain('useQuery')
      expect(hooks).toContain('useMutation')
      expect(hooks).not.toContain('useApiTestMode')
    } finally {
      rmSync(outDir, { recursive: true })
    }
  })
})
