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
