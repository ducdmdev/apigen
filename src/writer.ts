import { mkdirSync, writeFileSync } from 'fs'
import { join } from 'path'
import type { IR } from './ir'
import { generateTypes } from './generators/types'
import { generateHooks } from './generators/hooks'
import { generateMocks } from './generators/mocks'
import { generateProvider } from './generators/provider'
import { generateIndexFile } from './generators/index-file'

function writeGeneratedFiles(ir: IR, outputDir: string): void {
  mkdirSync(outputDir, { recursive: true })

  writeFileSync(join(outputDir, 'types.ts'), generateTypes(ir), 'utf8')
  writeFileSync(join(outputDir, 'hooks.ts'), generateHooks(ir), 'utf8')
  writeFileSync(join(outputDir, 'mocks.ts'), generateMocks(ir), 'utf8')
  writeFileSync(join(outputDir, 'test-mode-provider.tsx'), generateProvider(), 'utf8')
  writeFileSync(join(outputDir, 'index.ts'), generateIndexFile(), 'utf8')
}

export { writeGeneratedFiles }
