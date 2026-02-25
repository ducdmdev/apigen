import { mkdirSync, writeFileSync } from 'fs'
import { join } from 'path'
import type { IR } from './ir'
import { generateTypes } from './generators/types'
import { generateHooks } from './generators/hooks'
import { generateMocks } from './generators/mocks'
import { generateProvider } from './generators/provider'
import { generateIndexFile } from './generators/index-file'

function writeGeneratedFiles(ir: IR, outputDir: string, options?: { mock?: boolean }): void {
  const mock = options?.mock ?? true

  mkdirSync(outputDir, { recursive: true })

  writeFileSync(join(outputDir, 'types.ts'), generateTypes(ir), 'utf8')
  writeFileSync(join(outputDir, 'hooks.ts'), generateHooks(ir, { mock }), 'utf8')
  if (mock) {
    writeFileSync(join(outputDir, 'mocks.ts'), generateMocks(ir), 'utf8')
    writeFileSync(join(outputDir, 'test-mode-provider.tsx'), generateProvider(), 'utf8')
  }
  writeFileSync(join(outputDir, 'index.ts'), generateIndexFile({ mock }), 'utf8')
}

export { writeGeneratedFiles }
