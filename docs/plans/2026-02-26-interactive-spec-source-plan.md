# Interactive Spec Source Selection — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** When `-i` is omitted from `apigen generate`, show an interactive prompt letting the user choose between local file, direct URL, or auto-discover from a base URL.

**Architecture:** Add `@inquirer/prompts` for the interactive menu. Create a `src/discover.ts` module for auto-discovery logic (try well-known API doc paths against a base URL). Modify `cli.ts` to fall back to the interactive prompt when `-i` is missing.

**Tech Stack:** TypeScript, @inquirer/prompts (select + input), Node fetch API

**Design doc:** `docs/plans/2026-02-26-interactive-spec-source-design.md`

---

### Task 1: Install @inquirer/prompts

**Files:**
- Modify: `package.json`

**Step 1: Install the dependency**

Run: `bun add @inquirer/prompts`

**Step 2: Verify installation**

Run: `bun install && bun run typecheck`
Expected: No errors

**Step 3: Commit**

```bash
git add package.json bun.lock
git commit -m "chore: add @inquirer/prompts dependency"
```

---

### Task 2: Create discover.ts with tests (TDD)

**Files:**
- Create: `src/discover.ts`
- Create: `tests/discover.test.ts`

**Step 1: Write the failing tests**

Create `tests/discover.test.ts`:

```ts
import { describe, it, expect, afterAll, beforeAll } from 'vitest'
import { createServer, type Server } from 'http'
import { discoverSpec, WELL_KNOWN_PATHS } from '../src/discover'

describe('discoverSpec', () => {
  let server: Server
  let baseUrl: string

  beforeAll(async () => {
    server = createServer((req, res) => {
      if (req.url === '/v3/api-docs') {
        res.writeHead(200, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ openapi: '3.0.3', info: { title: 'Test', version: '1.0' }, paths: {} }))
      } else if (req.url === '/swagger.json') {
        res.writeHead(200, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ swagger: '2.0', info: { title: 'Test', version: '1.0' }, paths: {} }))
      } else {
        res.writeHead(404)
        res.end('Not Found')
      }
    })

    await new Promise<void>((resolve) => {
      server.listen(0, '127.0.0.1', () => {
        const addr = server.address()
        if (addr && typeof addr === 'object') {
          baseUrl = `http://127.0.0.1:${addr.port}`
        }
        resolve()
      })
    })
  })

  afterAll(() => {
    server?.close()
  })

  it('discovers OpenAPI 3.x spec at first matching path', async () => {
    const result = await discoverSpec(baseUrl)
    expect(result.url).toBe(`${baseUrl}/v3/api-docs`)
    expect(result.version).toBe('openapi3')
  })

  it('discovers Swagger 2.0 spec when only swagger.json is available', async () => {
    // Create a server that only serves /swagger.json
    const swaggerServer = createServer((req, res) => {
      if (req.url === '/swagger.json') {
        res.writeHead(200, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ swagger: '2.0', info: { title: 'Test', version: '1.0' }, paths: {} }))
      } else {
        res.writeHead(404)
        res.end('Not Found')
      }
    })

    const swaggerBaseUrl = await new Promise<string>((resolve) => {
      swaggerServer.listen(0, '127.0.0.1', () => {
        const addr = swaggerServer.address()
        if (addr && typeof addr === 'object') {
          resolve(`http://127.0.0.1:${addr.port}`)
        }
      })
    })

    try {
      const result = await discoverSpec(swaggerBaseUrl)
      expect(result.url).toBe(`${swaggerBaseUrl}/swagger.json`)
      expect(result.version).toBe('swagger2')
    } finally {
      swaggerServer.close()
    }
  })

  it('throws when no spec is found at any well-known path', async () => {
    // Create a server that returns 404 for everything
    const emptyServer = createServer((_req, res) => {
      res.writeHead(404)
      res.end('Not Found')
    })

    const emptyBaseUrl = await new Promise<string>((resolve) => {
      emptyServer.listen(0, '127.0.0.1', () => {
        const addr = emptyServer.address()
        if (addr && typeof addr === 'object') {
          resolve(`http://127.0.0.1:${addr.port}`)
        }
      })
    })

    try {
      await expect(discoverSpec(emptyBaseUrl)).rejects.toThrow('Could not find an API spec')
    } finally {
      emptyServer.close()
    }
  })

  it('strips trailing slash from base URL', async () => {
    const result = await discoverSpec(`${baseUrl}/`)
    expect(result.url).toBe(`${baseUrl}/v3/api-docs`)
  })

  it('exports the well-known paths list', () => {
    expect(WELL_KNOWN_PATHS).toEqual([
      '/v3/api-docs',
      '/swagger.json',
      '/openapi.json',
      '/api-docs',
      '/docs/openapi.json',
    ])
  })
})
```

**Step 2: Run tests to verify they fail**

Run: `bun test tests/discover.test.ts`
Expected: FAIL — module `../src/discover` does not exist

**Step 3: Implement discover.ts**

Create `src/discover.ts`:

```ts
import { parse as parseYaml } from 'yaml'
import { detectSpecVersion } from './loader'
import type { SpecVersion } from './loader'

const WELL_KNOWN_PATHS = [
  '/v3/api-docs',
  '/swagger.json',
  '/openapi.json',
  '/api-docs',
  '/docs/openapi.json',
] as const

interface DiscoverResult {
  url: string
  version: SpecVersion
}

async function discoverSpec(baseUrl: string): Promise<DiscoverResult> {
  const normalizedBase = baseUrl.replace(/\/+$/, '')
  const tried: string[] = []

  for (const path of WELL_KNOWN_PATHS) {
    const url = `${normalizedBase}${path}`
    tried.push(url)

    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(3000) })
      if (!response.ok) continue

      const text = await response.text()
      let parsed: Record<string, unknown>
      try {
        parsed = JSON.parse(text)
      } catch {
        parsed = parseYaml(text) as Record<string, unknown>
      }

      const version = detectSpecVersion(parsed)
      if (version !== 'unknown') {
        return { url, version }
      }
    } catch {
      continue
    }
  }

  throw new Error(
    `Could not find an API spec at ${normalizedBase}. Tried:\n${tried.map((u) => `  - ${u}`).join('\n')}`
  )
}

export { discoverSpec, WELL_KNOWN_PATHS }
export type { DiscoverResult }
```

**Step 4: Run tests to verify they pass**

Run: `bun test tests/discover.test.ts`
Expected: All 5 tests PASS

**Step 5: Run full test suite to check for regressions**

Run: `bun test`
Expected: All tests pass

**Step 6: Commit**

```bash
git add src/discover.ts tests/discover.test.ts
git commit -m "feat: add auto-discovery of API specs at well-known paths"
```

---

### Task 3: Update cli.ts with interactive prompt

**Files:**
- Modify: `src/cli.ts:19` — change `requiredOption` to `option`
- Modify: `src/cli.ts:23-37` — add `promptForInput()` call when `options.input` is undefined

**Step 1: Modify cli.ts**

Replace the full content of `src/cli.ts` with:

```ts
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
```

**Step 2: Verify typecheck passes**

Run: `bun run typecheck`
Expected: No errors

**Step 3: Run full test suite**

Run: `bun test`
Expected: All tests pass (existing tests all provide `-i` so they never hit the prompt)

**Step 4: Commit**

```bash
git add src/cli.ts
git commit -m "feat: add interactive spec source prompt when -i is omitted"
```

---

### Task 4: Manual smoke test

**Step 1: Build the CLI**

Run: `bun run build`
Expected: Build succeeds

**Step 2: Test with -i flag (should work as before)**

Run: `node dist/cli.js generate -i tests/fixtures/petstore-oas3.yaml -o /tmp/apigen-smoke`
Expected: Generates files to `/tmp/apigen-smoke/` without any prompt

**Step 3: Test without -i flag (should show prompt)**

Run: `node dist/cli.js generate -o /tmp/apigen-smoke2`
Expected: Shows interactive menu with 3 options. Pick "Local file path", enter `tests/fixtures/petstore-oas3.yaml`, generates files.

**Step 4: Clean up**

Run: `rm -rf /tmp/apigen-smoke /tmp/apigen-smoke2`
