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
})
