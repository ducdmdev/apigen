#!/usr/bin/env node

import { Command } from 'commander'
import { resolve } from 'path'
import { loadSpec } from './loader'
import { extractIR } from './ir'
import { writeGeneratedFiles } from './writer'

const program = new Command()

program
  .name('apigen-tanstack')
  .description('Generate TanStack Query hooks from OpenAPI/Swagger specs')
  .version('0.1.0')

program
  .command('generate')
  .description('Generate hooks, types, and mocks from an OpenAPI spec')
  .requiredOption('-i, --input <path>', 'Path to OpenAPI/Swagger spec file')
  .option('-o, --output <path>', 'Output directory', './src/api/generated')
  .option('--no-mock', 'Skip mock data generation')
  .action(async (options: { input: string; output: string; mock: boolean }) => {
    const inputPath = resolve(options.input)
    const outputPath = resolve(options.output)

    console.log(`Reading spec from ${inputPath}`)

    const spec = await loadSpec(inputPath)
    const ir = extractIR(spec)

    console.log(`Found ${ir.operations.length} operations, ${ir.schemas.length} schemas`)

    writeGeneratedFiles(ir, outputPath, { mock: options.mock })

    console.log(`Generated files written to ${outputPath}`)
  })

await program.parseAsync(process.argv)
