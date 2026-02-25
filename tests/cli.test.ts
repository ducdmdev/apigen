import { describe, it, expect } from 'vitest'
import { resolve, join } from 'path'
import { mkdtempSync, existsSync, rmSync } from 'fs'
import { tmpdir } from 'os'
import { execSync } from 'child_process'

describe('CLI', () => {
  it('generates files from OpenAPI spec via CLI', () => {
    const outDir = mkdtempSync(join(tmpdir(), 'oqf-cli-test-'))
    const specPath = resolve(__dirname, 'fixtures/petstore-oas3.yaml')

    try {
      execSync(
        `bun run src/cli.ts generate --input ${specPath} --output ${outDir}`,
        { cwd: resolve(__dirname, '..'), stdio: 'pipe' }
      )

      expect(existsSync(join(outDir, 'types.ts'))).toBe(true)
      expect(existsSync(join(outDir, 'hooks.ts'))).toBe(true)
      expect(existsSync(join(outDir, 'mocks.ts'))).toBe(true)
      expect(existsSync(join(outDir, 'test-mode-provider.tsx'))).toBe(true)
      expect(existsSync(join(outDir, 'index.ts'))).toBe(true)
    } finally {
      rmSync(outDir, { recursive: true })
    }
  })

  it('generates files from Swagger 2.0 spec', () => {
    const outDir = mkdtempSync(join(tmpdir(), 'oqf-cli-test-'))
    const specPath = resolve(__dirname, 'fixtures/petstore-swagger2.yaml')

    try {
      execSync(
        `bun run src/cli.ts generate --input ${specPath} --output ${outDir}`,
        { cwd: resolve(__dirname, '..'), stdio: 'pipe' }
      )

      expect(existsSync(join(outDir, 'types.ts'))).toBe(true)
      expect(existsSync(join(outDir, 'hooks.ts'))).toBe(true)
    } finally {
      rmSync(outDir, { recursive: true })
    }
  })
})
