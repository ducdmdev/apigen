import { describe, it, expect } from 'vitest'
import { resolve, join } from 'path'
import { mkdtempSync, existsSync, readFileSync, rmSync } from 'fs'
import { tmpdir } from 'os'
import { loadSpec } from '../src/loader'
import { extractIR } from '../src/ir'
import { writeGeneratedFiles } from '../src/writer'

describe('writeGeneratedFiles', () => {
  it('writes all generated files to output directory', async () => {
    const spec = await loadSpec(resolve(__dirname, 'fixtures/petstore-oas3.yaml'))
    const ir = extractIR(spec)
    const outDir = mkdtempSync(join(tmpdir(), 'oqf-test-'))

    try {
      writeGeneratedFiles(ir, outDir)

      expect(existsSync(join(outDir, 'types.ts'))).toBe(true)
      expect(existsSync(join(outDir, 'hooks.ts'))).toBe(true)
      expect(existsSync(join(outDir, 'mocks.ts'))).toBe(true)
      expect(existsSync(join(outDir, 'test-mode-provider.tsx'))).toBe(true)
      expect(existsSync(join(outDir, 'index.ts'))).toBe(true)

      const indexContent = readFileSync(join(outDir, 'index.ts'), 'utf8')
      expect(indexContent).toContain("export * from './types'")
      expect(indexContent).toContain("export * from './hooks'")
      expect(indexContent).toContain("export * from './mocks'")
      expect(indexContent).toContain("export * from './test-mode-provider'")
    } finally {
      rmSync(outDir, { recursive: true })
    }
  })

  it('skips mocks and provider when mock is false', async () => {
    const spec = await loadSpec(resolve(__dirname, 'fixtures/petstore-oas3.yaml'))
    const ir = extractIR(spec)
    const outDir = mkdtempSync(join(tmpdir(), 'oqf-test-'))

    try {
      writeGeneratedFiles(ir, outDir, { mock: false })

      expect(existsSync(join(outDir, 'types.ts'))).toBe(true)
      expect(existsSync(join(outDir, 'hooks.ts'))).toBe(true)
      expect(existsSync(join(outDir, 'index.ts'))).toBe(true)
      expect(existsSync(join(outDir, 'mocks.ts'))).toBe(false)
      expect(existsSync(join(outDir, 'test-mode-provider.tsx'))).toBe(false)

      const indexContent = readFileSync(join(outDir, 'index.ts'), 'utf8')
      expect(indexContent).toContain("export * from './types'")
      expect(indexContent).toContain("export * from './hooks'")
      expect(indexContent).not.toContain("export * from './mocks'")
      expect(indexContent).not.toContain("export * from './test-mode-provider'")

      const hooksContent = readFileSync(join(outDir, 'hooks.ts'), 'utf8')
      expect(hooksContent).not.toContain('useApiTestMode')
      expect(hooksContent).not.toContain("from './mocks'")
      expect(hooksContent).not.toContain("from './test-mode-provider'")
    } finally {
      rmSync(outDir, { recursive: true })
    }
  })

  it('passes baseURL to generated hooks when provided', async () => {
    const spec = await loadSpec(resolve(__dirname, 'fixtures/petstore-oas3.yaml'))
    const ir = extractIR(spec)
    const outDir = mkdtempSync(join(tmpdir(), 'oqf-test-'))

    try {
      writeGeneratedFiles(ir, outDir, { mock: true, baseURL: 'https://api.example.com' })

      const hooks = readFileSync(join(outDir, 'hooks.ts'), 'utf8')
      expect(hooks).toContain('https://api.example.com')
    } finally {
      rmSync(outDir, { recursive: true })
    }
  })

  it('passes baseURL to split mode api-fetch when provided', async () => {
    const spec = await loadSpec(resolve(__dirname, 'fixtures/tagged-api.yaml'))
    const ir = extractIR(spec)
    const outDir = mkdtempSync(join(tmpdir(), 'oqf-test-'))

    try {
      writeGeneratedFiles(ir, outDir, { split: true, baseURL: 'https://api.example.com' })

      const apiFetch = readFileSync(join(outDir, 'api-fetch.ts'), 'utf8')
      expect(apiFetch).toContain('https://api.example.com')
    } finally {
      rmSync(outDir, { recursive: true })
    }
  })
})
