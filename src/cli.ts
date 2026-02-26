#!/usr/bin/env node

import { Command } from 'commander'
import { resolve } from 'path'
import { select, input } from '@inquirer/prompts'
import { loadSpec } from './loader'
import { extractIR } from './ir'
import { writeGeneratedFiles } from './writer'
import { discoverSpec } from './discover'

async function promptForInput(): Promise<string> {
  const source = await select({
    message: 'How would you like to provide your API spec?',
    choices: [
      { name: 'Local file path', value: 'file' },
      { name: 'Direct URL to spec', value: 'url' },
      { name: 'Auto-discover from base URL', value: 'discover' },
    ],
  })

  if (source === 'file') {
    const filePath = await input({
      message: 'Enter the file path:',
      validate: (v) => (v.trim().length > 0 ? true : 'File path is required'),
    })
    return resolve(filePath.trim())
  }

  if (source === 'url') {
    const url = await input({
      message: 'Enter the spec URL:',
      validate: (v) =>
        v.startsWith('http://') || v.startsWith('https://') ? true : 'Must be an http:// or https:// URL',
    })
    return url.trim()
  }

  // source === 'discover'
  const baseUrl = await input({
    message: 'Enter your API base URL (e.g. http://localhost:8080):',
    validate: (v) =>
      v.startsWith('http://') || v.startsWith('https://') ? true : 'Must be an http:// or https:// URL',
  })

  console.log('Searching for API spec...')
  const result = await discoverSpec(baseUrl.trim())
  console.log(`Found ${result.version === 'swagger2' ? 'Swagger 2.0' : 'OpenAPI 3.x'} spec at ${result.url}`)
  return result.url
}

const program = new Command()

program
  .name('apigen-tanstack')
  .description('Generate TanStack Query hooks from OpenAPI/Swagger specs')
  .version('0.1.0')

program
  .command('generate')
  .description('Generate hooks, types, and mocks from an OpenAPI spec')
  .option('-i, --input <path>', 'Path or URL to OpenAPI/Swagger spec')
  .option('-o, --output <path>', 'Output directory', './src/api/generated')
  .option('--no-mock', 'Skip mock data generation')
  .option('--split', 'Split output into per-tag feature folders')
  .action(async (options: { input?: string; output: string; mock: boolean; split?: boolean }) => {
    const inputValue = options.input ?? (await promptForInput())
    const isUrlInput = inputValue.startsWith('http://') || inputValue.startsWith('https://')
    const inputPath = isUrlInput ? inputValue : resolve(inputValue)
    const outputPath = resolve(options.output)

    console.log(`Reading spec from ${inputPath}`)

    const spec = await loadSpec(inputPath)
    const ir = extractIR(spec)

    console.log(`Found ${ir.operations.length} operations, ${ir.schemas.length} schemas`)

    writeGeneratedFiles(ir, outputPath, { mock: options.mock, split: options.split })

    console.log(`Generated files written to ${outputPath}`)
  })

await program.parseAsync(process.argv)
