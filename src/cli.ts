#!/usr/bin/env node

import { Command } from 'commander'
import { resolve, dirname, join } from 'path'
import { existsSync, readFileSync } from 'fs'
import { fileURLToPath, pathToFileURL } from 'url'
import { select, input, confirm } from '@inquirer/prompts'
import { loadSpec } from './loader'
import { extractIR } from './ir'
import { writeGeneratedFiles } from './writer'
import type { FileInfo } from './writer'
import { discoverSpec } from './discover'
import { resolveConfig } from './config'
import type { ConfigInput } from './config'

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

async function loadConfigFile(configPath: string): Promise<ConfigInput> {
  const resolved = resolve(configPath)
  if (!existsSync(resolved)) {
    throw new Error(`Config file not found: ${configPath}`)
  }
  const module = await import(pathToFileURL(resolved).toString())
  return module.default ?? module
}

function findConfigFile(): string | null {
  for (const name of ['apigen.config.ts', 'apigen.config.js']) {
    if (existsSync(resolve(name))) return resolve(name)
  }
  return null
}

const __dirname = dirname(fileURLToPath(import.meta.url))
const pkg = JSON.parse(readFileSync(join(__dirname, '..', 'package.json'), 'utf-8'))

const program = new Command()

program
  .name('apigen-tanstack')
  .description('Generate TanStack Query hooks from OpenAPI/Swagger specs')
  .version(pkg.version)

program
  .command('generate')
  .description('Generate hooks, types, and mocks from an OpenAPI spec')
  .option('-i, --input <path>', 'Path or URL to OpenAPI/Swagger spec')
  .option('-o, --output <path>', 'Output directory', './src/api/generated')
  .option('--no-mock', 'Skip mock data generation')
  .option('--split', 'Split output into per-tag feature folders')
  .option('-c, --config <path>', 'Path to config file (searches for apigen.config.ts by default)')
  .option('--base-url <url>', 'Base URL prefix for all API fetch paths')
  .option('--dry-run', 'Preview files that would be generated without writing')
  .action(async (options: { input?: string; output: string; mock: boolean; split?: boolean; config?: string; baseUrl?: string; dryRun?: boolean }) => {
    // Load config file (explicit or auto-search)
    let fileConfig: ConfigInput | null = null
    if (options.config) {
      fileConfig = await loadConfigFile(options.config)
    } else {
      const found = findConfigFile()
      if (found) {
        console.log(`Using config file: ${found}`)
        fileConfig = await loadConfigFile(found)
      }
    }

    // Merge: CLI flags override config file
    const config = resolveConfig({
      input: options.input ?? fileConfig?.input ?? '',
      output: options.output !== './src/api/generated' ? options.output : (fileConfig?.output ?? options.output),
      mock: options.mock !== undefined ? options.mock : fileConfig?.mock,
      split: options.split ?? fileConfig?.split,
      baseURL: options.baseUrl ?? fileConfig?.baseURL,
      apiFetchImportPath: fileConfig?.apiFetchImportPath,
    })

    const inputValue = config.input || (await promptForInput())
    const isUrlInput = inputValue.startsWith('http://') || inputValue.startsWith('https://')
    const inputPath = isUrlInput ? inputValue : resolve(inputValue)
    const outputPath = resolve(config.output)

    console.log(`Reading spec from ${inputPath}`)

    const spec = await loadSpec(inputPath)
    const ir = extractIR(spec)

    console.log(`Found ${ir.operations.length} operations, ${ir.schemas.length} schemas`)

    if (options.dryRun) {
      const files = writeGeneratedFiles(ir, outputPath, {
        mock: config.mock,
        split: config.split,
        baseURL: config.baseURL,
        apiFetchImportPath: config.apiFetchImportPath,
        dryRun: true,
      }) as FileInfo[]
      const totalSize = files.reduce((sum, f) => sum + f.size, 0)

      console.log('\nDry run — files that would be generated:\n')
      for (const f of files) {
        const sizeStr = f.size > 1024 ? `${(f.size / 1024).toFixed(1)} KB` : `${f.size} B`
        console.log(`  ${f.path}  (${sizeStr})`)
      }
      const totalStr = totalSize > 1024 ? `${(totalSize / 1024).toFixed(1)} KB` : `${totalSize} B`
      console.log(`\n  Total: ${files.length} files, ${totalStr}\n`)

      // In non-TTY (CI), just print and exit
      if (!process.stdin.isTTY) return

      // In TTY, ask to proceed
      const proceed = await confirm({ message: 'Proceed with generation?' })
      if (!proceed) {
        console.log('Cancelled.')
        return
      }

      // User said yes — do the actual write
      writeGeneratedFiles(ir, outputPath, {
        mock: config.mock,
        split: config.split,
        baseURL: config.baseURL,
        apiFetchImportPath: config.apiFetchImportPath,
      })
      console.log(`Generated files written to ${outputPath}`)
      return
    }

    writeGeneratedFiles(ir, outputPath, {
      mock: config.mock,
      split: config.split,
      baseURL: config.baseURL,
      apiFetchImportPath: config.apiFetchImportPath,
    })

    console.log(`Generated files written to ${outputPath}`)
  })

await program.parseAsync(process.argv)
