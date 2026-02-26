# Tier 1 CLI Improvements Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add config file loading, extended config options (split/baseURL/apiFetchImportPath), --dry-run, better error messages, circular reference detection, allOf composition, an interactive config init wizard, and dry-run confirmation to make apigen CI/CD-ready and beginner-friendly.

**Architecture:** Bottom-up approach — harden IR first (circular refs + allOf), then expand config types, then wire through generators/writer, then add CLI flags, then layer interactive prompts on top. Each task is independently testable. All changes are non-breaking and opt-in.

**Tech Stack:** TypeScript, Vitest, Commander.js, @inquirer/prompts (select, input, confirm), Node.js dynamic `import()` for config file loading.

**Design doc:** `docs/plans/2026-02-26-tier1-cli-improvements-design.md`

---

### Task 1: Circular Reference Detection in IR

**Files:**
- Modify: `src/ir.ts:293-312` (top-level schema extraction loop)
- Test: `tests/ir.test.ts`

**Step 1: Write the failing test**

Add to `tests/ir.test.ts`:

```typescript
it('detects circular references and breaks the cycle', () => {
  const spec = {
    paths: {},
    components: {
      schemas: {
        User: {
          type: 'object',
          required: ['id'],
          properties: {
            id: { type: 'string' },
            manager: { $ref: '#/components/schemas/User' },
          },
        },
        Node: {
          type: 'object',
          properties: {
            value: { type: 'string' },
            children: { type: 'array', items: { $ref: '#/components/schemas/Node' } },
          },
        },
      },
    },
  }
  const ir = extractIR(spec as Record<string, unknown>)

  // Should complete without infinite loop
  expect(ir.schemas).toHaveLength(2)

  const user = ir.schemas.find(s => s.name === 'User')
  expect(user).toBeDefined()
  expect(user!.properties.find(p => p.name === 'manager')!.ref).toBe('#/components/schemas/User')

  const node = ir.schemas.find(s => s.name === 'Node')
  expect(node).toBeDefined()
  const children = node!.properties.find(p => p.name === 'children')!
  expect(children.isArray).toBe(true)
})
```

**Step 2: Run test to verify it fails**

Run: `bun test tests/ir.test.ts -- -t "detects circular references"`
Expected: Test hangs or times out due to infinite recursion.

**Step 3: Write minimal implementation**

In `src/ir.ts`, the top-level schema loop (lines 293-312) does NOT recurse into `$ref` — it only reads `properties` directly. So circular refs at the top-level schema extraction already work (they just emit `ref` strings). The real risk is in inline schema extraction via `extractInlineSchema` when a request body or response has inline schemas that reference component schemas.

The fix: In the schema extraction loop, add a `visited` set and pass it through. When extracting properties, if a `$ref` references a schema that's currently being visited, keep the `ref` string (which generators already handle) instead of trying to inline it.

Modify `extractIR()` at the schema loop section:

```typescript
// Add at top of extractIR, before the schema loop:
const visiting = new Set<string>()

// In the schema loop, wrap each schema processing:
for (const [name, schemaDef] of Object.entries(schemasDef)) {
  visiting.add(name)
  // ... existing property extraction ...
  visiting.delete(name)
  schemas.push({ name, properties, required })
}
```

The current code already handles `$ref` by keeping it as a string — it does NOT inline referenced schemas. So circular refs at the component level already work. The test should pass without code changes. If it does hang, add the visited set guard.

**Step 4: Run test to verify it passes**

Run: `bun test tests/ir.test.ts -- -t "detects circular references"`
Expected: PASS

**Step 5: Run full test suite**

Run: `bun test`
Expected: All existing tests pass

**Step 6: Commit**

```
feat(ir): add circular reference detection test
```

---

### Task 2: allOf Composition Support

**Files:**
- Modify: `src/ir.ts` (add `resolveAllOf` function, wire into schema extraction)
- Create: `tests/fixtures/allof-composition.yaml`
- Test: `tests/ir.test.ts`

**Step 1: Create the allOf test fixture**

Create `tests/fixtures/allof-composition.yaml`:

```yaml
openapi: "3.0.3"
info:
  title: allOf Test
  version: "1.0"
paths:
  /users:
    get:
      operationId: listUsers
      responses:
        "200":
          description: ok
          content:
            application/json:
              schema:
                type: array
                items:
                  $ref: "#/components/schemas/User"
    post:
      operationId: createUser
      requestBody:
        content:
          application/json:
            schema:
              $ref: "#/components/schemas/CreateUserBody"
      responses:
        "201":
          description: created
          content:
            application/json:
              schema:
                $ref: "#/components/schemas/User"
components:
  schemas:
    BaseEntity:
      type: object
      required:
        - id
      properties:
        id:
          type: string
        createdAt:
          type: string
          format: date-time
    User:
      allOf:
        - $ref: "#/components/schemas/BaseEntity"
        - type: object
          required:
            - name
          properties:
            name:
              type: string
            email:
              type: string
    CreateUserBody:
      type: object
      required:
        - name
      properties:
        name:
          type: string
        email:
          type: string
```

**Step 2: Write the failing tests**

Add to `tests/ir.test.ts`:

```typescript
it('resolves allOf by merging properties from all variants', async () => {
  const spec = await loadSpec(resolve(__dirname, 'fixtures/allof-composition.yaml'))
  const ir = extractIR(spec)

  const user = ir.schemas.find(s => s.name === 'User')
  expect(user).toBeDefined()
  // Should have merged properties from BaseEntity + inline
  expect(user!.properties).toHaveLength(4)
  expect(user!.properties.find(p => p.name === 'id')).toBeDefined()
  expect(user!.properties.find(p => p.name === 'createdAt')).toBeDefined()
  expect(user!.properties.find(p => p.name === 'name')).toBeDefined()
  expect(user!.properties.find(p => p.name === 'email')).toBeDefined()
  // Required should merge from both
  expect(user!.required).toContain('id')
  expect(user!.required).toContain('name')
})

it('resolves allOf with inline-only variants (no $ref)', () => {
  const spec = {
    paths: {},
    components: {
      schemas: {
        Merged: {
          allOf: [
            { type: 'object', required: ['a'], properties: { a: { type: 'string' } } },
            { type: 'object', properties: { b: { type: 'number' } } },
          ],
        },
      },
    },
  }
  const ir = extractIR(spec as Record<string, unknown>)
  const merged = ir.schemas.find(s => s.name === 'Merged')
  expect(merged).toBeDefined()
  expect(merged!.properties).toHaveLength(2)
  expect(merged!.properties.find(p => p.name === 'a')!.type).toBe('string')
  expect(merged!.properties.find(p => p.name === 'b')!.type).toBe('number')
  expect(merged!.required).toContain('a')
})
```

**Step 3: Run tests to verify they fail**

Run: `bun test tests/ir.test.ts -- -t "resolves allOf"`
Expected: FAIL — allOf schemas currently generate 0 properties

**Step 4: Implement resolveAllOf**

Add to `src/ir.ts` before `extractIR`:

```typescript
function resolveAllOf(
  allOfArray: Record<string, unknown>[],
  schemasDef: Record<string, Record<string, unknown>>,
): { properties: Record<string, Record<string, unknown>>; required: string[] } {
  const mergedProps: Record<string, Record<string, unknown>> = {}
  const mergedRequired: string[] = []

  for (const variant of allOfArray) {
    let variantSchema = variant

    // Resolve $ref to component schema
    if (variant.$ref && typeof variant.$ref === 'string') {
      const refName = (variant.$ref as string).split('/').pop()
      if (refName && schemasDef[refName]) {
        variantSchema = schemasDef[refName]
        // If the referenced schema itself uses allOf, resolve it recursively (one level)
        if (Array.isArray(variantSchema.allOf)) {
          const resolved = resolveAllOf(variantSchema.allOf as Record<string, unknown>[], schemasDef)
          Object.assign(mergedProps, resolved.properties)
          mergedRequired.push(...resolved.required)
          continue
        }
      }
    }

    const props = (variantSchema.properties ?? {}) as Record<string, Record<string, unknown>>
    const req = (variantSchema.required ?? []) as string[]
    Object.assign(mergedProps, props)
    mergedRequired.push(...req)
  }

  return { properties: mergedProps, required: mergedRequired }
}
```

In `extractIR`, modify the top-level schema loop to detect allOf:

```typescript
for (const [name, schemaDef] of Object.entries(schemasDef)) {
  let props: Record<string, Record<string, unknown>>
  let required: string[]

  if (Array.isArray(schemaDef.allOf)) {
    const resolved = resolveAllOf(schemaDef.allOf as Record<string, unknown>[], schemasDef)
    props = resolved.properties
    required = resolved.required
  } else {
    props = (schemaDef.properties ?? {}) as Record<string, Record<string, unknown>>
    required = (schemaDef.required ?? []) as string[]
  }

  const properties: IRProperty[] = Object.entries(props).map(([propName, propSchema]) => {
    // ... existing property mapping logic (lines 297-309) ...
  })

  schemas.push({ name, properties, required })
}
```

**Step 5: Run tests to verify they pass**

Run: `bun test tests/ir.test.ts -- -t "resolves allOf"`
Expected: PASS

**Step 6: Run full test suite**

Run: `bun test`
Expected: All tests pass (existing tests unaffected)

**Step 7: Commit**

```
feat(ir): support allOf composition via property merging
```

---

### Task 3: Extend ConfigInput with split, baseURL, apiFetchImportPath

**Files:**
- Modify: `src/config.ts`
- Test: `tests/config.test.ts`

**Step 1: Write failing tests**

Add to `tests/config.test.ts`:

```typescript
it('resolveConfig applies split default to false', () => {
  const config = resolveConfig({ input: './spec.yaml' })
  expect(config.split).toBe(false)
})

it('resolveConfig passes through split, baseURL, apiFetchImportPath', () => {
  const config = resolveConfig({
    input: './spec.yaml',
    split: true,
    baseURL: 'https://api.example.com',
    apiFetchImportPath: './lib/api-client',
  })
  expect(config.split).toBe(true)
  expect(config.baseURL).toBe('https://api.example.com')
  expect(config.apiFetchImportPath).toBe('./lib/api-client')
})

it('resolveConfig leaves baseURL and apiFetchImportPath undefined when not set', () => {
  const config = resolveConfig({ input: './spec.yaml' })
  expect(config.baseURL).toBeUndefined()
  expect(config.apiFetchImportPath).toBeUndefined()
})
```

**Step 2: Run tests to verify they fail**

Run: `bun test tests/config.test.ts`
Expected: FAIL — `split`, `baseURL`, `apiFetchImportPath` not on Config type

**Step 3: Implement**

Update `src/config.ts`:

```typescript
interface Config {
  input: string
  output: string
  mock: boolean
  split: boolean
  baseURL?: string
  apiFetchImportPath?: string
}

interface ConfigInput {
  input: string
  output?: string
  mock?: boolean
  split?: boolean
  baseURL?: string
  apiFetchImportPath?: string
}

function resolveConfig(input: ConfigInput): Config {
  return {
    input: input.input,
    output: input.output ?? './src/api/generated',
    mock: input.mock ?? true,
    split: input.split ?? false,
    baseURL: input.baseURL,
    apiFetchImportPath: input.apiFetchImportPath,
  }
}
```

**Step 4: Run tests to verify they pass**

Run: `bun test tests/config.test.ts`
Expected: PASS

**Step 5: Run full test suite**

Run: `bun test`
Expected: All tests pass

**Step 6: Commit**

```
feat(config): add split, baseURL, apiFetchImportPath to ConfigInput
```

---

### Task 4: Wire baseURL Through Generators

**Files:**
- Modify: `src/generators/api-fetch.ts`
- Modify: `src/generators/hooks.ts:215-226` (inline apiFetch generation)
- Test: `tests/generators/api-fetch.test.ts`
- Test: `tests/generators/hooks.test.ts`

**Step 1: Write failing tests for api-fetch**

Add to `tests/generators/api-fetch.test.ts`:

```typescript
it('generates apiFetch with baseURL when provided', () => {
  const output = generateApiFetch({ baseURL: 'https://api.example.com' })
  expect(output).toContain('https://api.example.com')
  expect(output).toContain('`https://api.example.com${path}`')
})

it('generates apiFetch without baseURL when not provided', () => {
  const output = generateApiFetch()
  expect(output).not.toContain('https://')
  expect(output).toContain('fetch(path')
})
```

**Step 2: Write failing tests for hooks with baseURL**

Add to `tests/generators/hooks.test.ts`:

```typescript
it('generates inline apiFetch with baseURL when provided', async () => {
  const spec = await loadSpec(resolve(__dirname, '../fixtures/petstore-oas3.yaml'))
  const ir = extractIR(spec)
  const output = generateHooks(ir, { mock: false, baseURL: 'https://api.example.com' })

  expect(output).toContain('https://api.example.com')
  expect(output).toContain('`https://api.example.com${path}`')
})
```

**Step 3: Run tests to verify they fail**

Run: `bun test tests/generators/api-fetch.test.ts tests/generators/hooks.test.ts`
Expected: FAIL — `generateApiFetch` and `generateHooks` don't accept `baseURL`

**Step 4: Implement baseURL in api-fetch.ts**

Update `src/generators/api-fetch.ts`:

```typescript
function generateApiFetch(options?: { baseURL?: string }): string {
  const baseURL = options?.baseURL
  const lines: string[] = []
  lines.push('/* eslint-disable */')
  lines.push('/* This file is auto-generated by apigen. Do not edit. */')
  lines.push('')
  lines.push('export function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {')
  if (baseURL) {
    lines.push(`  return fetch(\`${baseURL}\${path}\`, {`)
  } else {
    lines.push('  return fetch(path, {')
  }
  lines.push("    headers: { 'Content-Type': 'application/json' },")
  lines.push('    ...init,')
  lines.push('  }).then(res => {')
  lines.push('    if (!res.ok) throw new Error(`${res.status} ${res.statusText}`)')
  lines.push('    return res.json() as Promise<T>')
  lines.push('  })')
  lines.push('}')
  lines.push('')
  return lines.join('\n')
}

export { generateApiFetch }
```

**Step 5: Implement baseURL in hooks.ts inline apiFetch**

In `src/generators/hooks.ts`, update the function signature and inline apiFetch block:

```typescript
function generateHooks(ir: IR, options?: { mock?: boolean; providerImportPath?: string; apiFetchImportPath?: string; baseURL?: string }): string {
```

Update the inline apiFetch generation (lines 215-226):

```typescript
if (!apiFetchImportPath) {
  const baseURL = options?.baseURL
  parts.push(`function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {`)
  if (baseURL) {
    parts.push(`  return fetch(\`${baseURL}\${path}\`, {`)
  } else {
    parts.push(`  return fetch(path, {`)
  }
  parts.push(`    headers: { 'Content-Type': 'application/json' },`)
  parts.push(`    ...init,`)
  parts.push(`  }).then(res => {`)
  parts.push(`    if (!res.ok) throw new Error(\`\${res.status} \${res.statusText}\`)`)
  parts.push(`    return res.json() as Promise<T>`)
  parts.push(`  })`)
  parts.push(`}`)
  parts.push('')
}
```

**Step 6: Run tests to verify they pass**

Run: `bun test tests/generators/api-fetch.test.ts tests/generators/hooks.test.ts`
Expected: PASS

**Step 7: Run full test suite**

Run: `bun test`
Expected: All tests pass

**Step 8: Commit**

```
feat(generators): wire baseURL into apiFetch and hooks generation
```

---

### Task 5: Wire Config Through Writer

**Files:**
- Modify: `src/writer.ts:51-113`
- Test: `tests/writer.test.ts`

**Step 1: Write failing test**

Add to `tests/writer.test.ts`:

```typescript
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
```

**Step 2: Run tests to verify they fail**

Run: `bun test tests/writer.test.ts`
Expected: FAIL — `writeGeneratedFiles` doesn't pass `baseURL` through

**Step 3: Implement**

Update `src/writer.ts` — add `baseURL` and `apiFetchImportPath` to the options type and pass through:

```typescript
function writeGeneratedFiles(ir: IR, outputDir: string, options?: { mock?: boolean; split?: boolean; baseURL?: string; apiFetchImportPath?: string }): void {
  const mock = options?.mock ?? true
  const split = options?.split ?? false
  const baseURL = options?.baseURL
  const apiFetchImportPath = options?.apiFetchImportPath

  if (split) {
    writeSplit(ir, outputDir, mock, { baseURL })
  } else {
    writeFlat(ir, outputDir, mock, { baseURL, apiFetchImportPath })
  }
}
```

Update `writeFlat` to pass `baseURL` to `generateHooks`:

```typescript
function writeFlat(ir: IR, outputDir: string, mock: boolean, opts?: { baseURL?: string; apiFetchImportPath?: string }): void {
  mkdirSync(outputDir, { recursive: true })

  writeFileSync(join(outputDir, 'types.ts'), generateTypes(ir), 'utf8')
  writeFileSync(join(outputDir, 'hooks.ts'), generateHooks(ir, { mock, baseURL: opts?.baseURL, apiFetchImportPath: opts?.apiFetchImportPath }), 'utf8')
  // ... rest unchanged
}
```

Update `writeSplit` to pass `baseURL` to `generateApiFetch` and `generateHooks`:

```typescript
function writeSplit(ir: IR, outputDir: string, mock: boolean, opts?: { baseURL?: string }): void {
  // ...
  writeFileSync(join(outputDir, 'api-fetch.ts'), generateApiFetch({ baseURL: opts?.baseURL }), 'utf8')
  // In per-tag loop, generateHooks already receives apiFetchImportPath for split mode
  // baseURL not needed in per-tag hooks since api-fetch handles it
  // ...
}
```

**Step 4: Run tests to verify they pass**

Run: `bun test tests/writer.test.ts`
Expected: PASS

**Step 5: Run full test suite**

Run: `bun test`
Expected: All tests pass

**Step 6: Commit**

```
feat(writer): pass baseURL and apiFetchImportPath through to generators
```

---

### Task 6: Config File Loading

**Files:**
- Modify: `src/cli.ts`
- Test: `tests/cli.test.ts` (or integration test)

**Step 1: Write the config file loader functions**

Add to `src/cli.ts` (before the `program` setup):

```typescript
import { existsSync } from 'fs'
import { pathToFileURL } from 'url'
import { resolveConfig } from './config'
import type { ConfigInput } from './config'

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
```

**Step 2: Wire config loading into the generate command**

Update the `.action()` handler in `src/cli.ts`:

```typescript
.option('-c, --config <path>', 'Path to config file (searches for apigen.config.ts by default)')
.option('--base-url <url>', 'Base URL prefix for all API fetch paths')
.action(async (options: { input?: string; output: string; mock: boolean; split?: boolean; config?: string; baseUrl?: string }) => {
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
  // ... rest of the pipeline using config ...
})
```

**Step 3: Run full test suite**

Run: `bun test`
Expected: All existing tests still pass

**Step 4: Commit**

```
feat(cli): add config file loading with --config flag and auto-search
```

---

### Task 7: Interactive Config Init Wizard

**Files:**
- Modify: `src/cli.ts`

**Step 1: Add `promptForConfig()` function**

Add to `src/cli.ts` after the existing `promptForInput()` function:

```typescript
import { confirm } from '@inquirer/prompts'  // add to existing import from '@inquirer/prompts'

async function promptForConfig(inputValue: string): Promise<ConfigInput> {
  const output = await input({
    message: 'Output directory:',
    default: './src/api/generated',
  })

  const mock = await confirm({
    message: 'Generate mock data?',
    default: true,
  })

  const split = await confirm({
    message: 'Split output by API tags?',
    default: false,
  })

  const baseURL = await input({
    message: 'Base URL for API calls (leave empty for relative paths):',
  })

  const configInput: ConfigInput = {
    input: inputValue,
    output: output.trim(),
    mock,
    split,
    ...(baseURL.trim() ? { baseURL: baseURL.trim() } : {}),
  }

  const shouldSave = await confirm({
    message: 'Save as apigen.config.ts?',
    default: true,
  })

  if (shouldSave) {
    writeConfigFile(configInput)
    console.log('Saved apigen.config.ts')
  }

  return configInput
}
```

**Step 2: Add `writeConfigFile()` helper**

Add to `src/cli.ts`:

```typescript
function writeConfigFile(config: ConfigInput): void {
  const lines = [
    `import { defineConfig } from 'apigen-tanstack'`,
    ``,
    `export default defineConfig(${JSON.stringify(config, null, 2)})`,
    ``,
  ]
  writeFileSync('apigen.config.ts', lines.join('\n'), 'utf8')
}
```

**Step 3: Wire into the action handler**

Update the action handler to call `promptForConfig()` when no config file exists and no `-i` was given:

```typescript
.action(async (options) => {
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

  // If no config file and no -i flag, run interactive wizard
  if (!fileConfig && !options.input) {
    const inputValue = await promptForInput()
    const wizardConfig = await promptForConfig(inputValue)
    const config = resolveConfig(wizardConfig)
    // ... proceed with pipeline using config
  } else {
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
    // ... proceed with pipeline using config + inputValue
  }
})
```

**Step 4: Run typecheck**

Run: `bun run typecheck`
Expected: No errors

**Step 5: Run full test suite**

Run: `bun test`
Expected: All existing tests still pass (they all provide `-i`, never hitting the wizard)

**Step 6: Commit**

```
feat(cli): add interactive config init wizard with @inquirer/prompts
```

---

### Task 8: --dry-run Flag with Confirmation Prompt

**Files:**
- Modify: `src/writer.ts`
- Modify: `src/cli.ts`
- Test: `tests/writer.test.ts`

**Step 1: Write failing test**

Add to `tests/writer.test.ts`:

```typescript
it('returns file metadata without writing when dryRun is true', async () => {
  const spec = await loadSpec(resolve(__dirname, 'fixtures/petstore-oas3.yaml'))
  const ir = extractIR(spec)
  const outDir = mkdtempSync(join(tmpdir(), 'oqf-test-'))

  try {
    const result = writeGeneratedFiles(ir, outDir, { mock: true, dryRun: true })

    // Should return file info
    expect(result).toBeDefined()
    expect(result!.length).toBeGreaterThan(0)
    expect(result!.some(f => f.path.endsWith('types.ts'))).toBe(true)
    expect(result!.some(f => f.path.endsWith('hooks.ts'))).toBe(true)
    expect(result!.every(f => f.size > 0)).toBe(true)

    // Should NOT have written any files
    expect(existsSync(join(outDir, 'types.ts'))).toBe(false)
    expect(existsSync(join(outDir, 'hooks.ts'))).toBe(false)
  } finally {
    rmSync(outDir, { recursive: true })
  }
})
```

**Step 2: Run test to verify it fails**

Run: `bun test tests/writer.test.ts -- -t "dryRun"`
Expected: FAIL — `dryRun` option doesn't exist

**Step 3: Implement dry-run in writer**

Update `src/writer.ts`:

```typescript
interface FileInfo {
  path: string
  size: number
}

function writeGeneratedFiles(
  ir: IR,
  outputDir: string,
  options?: { mock?: boolean; split?: boolean; baseURL?: string; apiFetchImportPath?: string; dryRun?: boolean },
): FileInfo[] | void {
  const mock = options?.mock ?? true
  const split = options?.split ?? false
  const dryRun = options?.dryRun ?? false
  const baseURL = options?.baseURL
  const apiFetchImportPath = options?.apiFetchImportPath

  if (dryRun) {
    return collectFileInfo(ir, outputDir, { mock, split, baseURL, apiFetchImportPath })
  }

  if (split) {
    writeSplit(ir, outputDir, mock, { baseURL })
  } else {
    writeFlat(ir, outputDir, mock, { baseURL, apiFetchImportPath })
  }
}
```

Add `collectFileInfo` function that generates content strings and returns metadata:

```typescript
function collectFileInfo(
  ir: IR,
  outputDir: string,
  opts: { mock: boolean; split: boolean; baseURL?: string; apiFetchImportPath?: string },
): FileInfo[] {
  const files: FileInfo[] = []

  if (opts.split) {
    // Similar to writeSplit but collect instead of write
    const groups = groupOperationsByTag(ir.operations)
    const tagSlugs = [...groups.keys()].sort()

    if (opts.mock) {
      const content = generateProvider()
      files.push({ path: join(outputDir, 'test-mode-provider.tsx'), size: Buffer.byteLength(content) })
    }
    const apiFetchContent = generateApiFetch({ baseURL: opts.baseURL })
    files.push({ path: join(outputDir, 'api-fetch.ts'), size: Buffer.byteLength(apiFetchContent) })

    for (const slug of tagSlugs) {
      const ops = groups.get(slug)!
      const subsetIR = buildSubsetIR(ops, ir.schemas)
      const featureDir = join(outputDir, slug)

      files.push({ path: join(featureDir, 'types.ts'), size: Buffer.byteLength(generateTypes(subsetIR)) })
      files.push({ path: join(featureDir, 'hooks.ts'), size: Buffer.byteLength(generateHooks(subsetIR, { mock: opts.mock, providerImportPath: '../test-mode-provider', apiFetchImportPath: '../api-fetch' })) })
      if (opts.mock) {
        files.push({ path: join(featureDir, 'mocks.ts'), size: Buffer.byteLength(generateMocks(subsetIR)) })
      }
      files.push({ path: join(featureDir, 'index.ts'), size: Buffer.byteLength(generateIndexFile({ mock: opts.mock, includeProvider: false })) })
    }

    files.push({ path: join(outputDir, 'index.ts'), size: Buffer.byteLength(generateRootIndexFile(tagSlugs, { mock: opts.mock })) })
  } else {
    files.push({ path: join(outputDir, 'types.ts'), size: Buffer.byteLength(generateTypes(ir)) })
    files.push({ path: join(outputDir, 'hooks.ts'), size: Buffer.byteLength(generateHooks(ir, { mock: opts.mock, baseURL: opts.baseURL, apiFetchImportPath: opts.apiFetchImportPath })) })
    if (opts.mock) {
      files.push({ path: join(outputDir, 'mocks.ts'), size: Buffer.byteLength(generateMocks(ir)) })
      files.push({ path: join(outputDir, 'test-mode-provider.tsx'), size: Buffer.byteLength(generateProvider()) })
    }
    files.push({ path: join(outputDir, 'index.ts'), size: Buffer.byteLength(generateIndexFile({ mock: opts.mock })) })
  }

  return files
}
```

**Step 4: Wire --dry-run into CLI with confirmation prompt**

In `src/cli.ts`, add the flag:

```typescript
.option('--dry-run', 'Preview files that would be generated without writing')
```

In the action handler, print the summary then prompt to confirm (TTY only):

```typescript
if (options.dryRun) {
  const files = writeGeneratedFiles(ir, outputPath, { ...config, dryRun: true }) as FileInfo[]
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
  writeGeneratedFiles(ir, outputPath, { ...config })
  console.log(`Generated files written to ${outputPath}`)
  return
}
```

**Step 5: Run tests to verify they pass**

Run: `bun test tests/writer.test.ts`
Expected: PASS

**Step 6: Run full test suite**

Run: `bun test`
Expected: All tests pass

**Step 7: Commit**

```
feat(cli): add --dry-run flag with interactive confirmation prompt
```

---

### Task 9: Improved Error Messages

**Files:**
- Modify: `src/loader.ts:51-72`
- Modify: `src/ir.ts:206-215`
- Test: `tests/loader.test.ts`
- Test: `tests/ir.test.ts`

**Step 1: Write failing tests for loader errors**

Add to `tests/loader.test.ts`:

```typescript
it('throws user-friendly error for file not found', async () => {
  await expect(loadSpec('./nonexistent-spec.yaml')).rejects.toThrow('Cannot find spec file')
})

it('throws user-friendly error for unparseable file', async () => {
  const tmpFile = join(tmpdir(), 'bad-spec-' + Date.now() + '.yaml')
  writeFileSync(tmpFile, '{{invalid yaml content', 'utf8')
  try {
    await expect(loadSpec(tmpFile)).rejects.toThrow('Failed to parse')
  } finally {
    rmSync(tmpFile)
  }
})
```

Add needed imports at top of `tests/loader.test.ts`:

```typescript
import { join } from 'path'
import { tmpdir } from 'os'
import { writeFileSync, rmSync } from 'fs'
```

**Step 2: Write failing tests for IR warnings**

Add to `tests/ir.test.ts`:

```typescript
import { vi } from 'vitest'

it('warns when spec has no paths', () => {
  const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
  const spec = { components: { schemas: {} } }
  const ir = extractIR(spec as Record<string, unknown>)
  expect(ir.operations).toHaveLength(0)
  expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('no paths'))
  warnSpy.mockRestore()
})
```

**Step 3: Run tests to verify they fail**

Run: `bun test tests/loader.test.ts tests/ir.test.ts`
Expected: FAIL — errors are raw stack traces, no warning for empty paths

**Step 4: Implement improved errors in loader.ts**

Update `src/loader.ts` `loadSpec` function:

```typescript
async function loadSpec(input: string): Promise<Record<string, unknown>> {
  if (isUrl(input)) {
    return loadSpecFromUrl(input)
  }

  if (!existsSync(input)) {
    throw new Error(`Cannot find spec file: ${input}. Check the path and try again.`)
  }

  let raw: string
  try {
    raw = readFileSync(input, 'utf8')
  } catch (err) {
    throw new Error(`Cannot read spec file: ${input}. ${(err as Error).message}`)
  }

  let parsed: Record<string, unknown>
  try {
    parsed = input.endsWith('.json') ? JSON.parse(raw) : parseYaml(raw)
  } catch (err) {
    throw new Error(`Failed to parse ${input}: ${(err as Error).message}. Ensure the file is valid YAML or JSON.`)
  }

  const version = detectSpecVersion(parsed)
  if (version === 'unknown') {
    throw new Error(`Unrecognized spec format in ${input}. Expected OpenAPI 3.x or Swagger 2.0.`)
  }

  // ... rest unchanged
}
```

Add `import { existsSync } from 'fs'` to the imports.

**Step 5: Implement warning in ir.ts**

Add at the top of `extractIR`:

```typescript
function extractIR(spec: Record<string, unknown>): IR {
  const paths = (spec.paths ?? {}) as Record<string, Record<string, unknown>>

  if (Object.keys(paths).length === 0) {
    console.warn("Warning: Spec has no 'paths' — 0 operations will be extracted.")
  }

  // ... rest unchanged
}
```

**Step 6: Run tests to verify they pass**

Run: `bun test tests/loader.test.ts tests/ir.test.ts`
Expected: PASS

**Step 7: Run full test suite**

Run: `bun test`
Expected: All tests pass

**Step 8: Commit**

```
fix(loader,ir): improve error messages for file not found, parse failures, and empty specs
```

---

### Task 10: E2E Integration Test with allOf Fixture

**Files:**
- Test: `tests/e2e.test.ts`

**Step 1: Write e2e test for allOf composition**

Add to `tests/e2e.test.ts`:

```typescript
describe('e2e: allOf composition', () => {
  it('generates correct types from allOf spec', async () => {
    const spec = await loadSpec(resolve(__dirname, 'fixtures/allof-composition.yaml'))
    const ir = extractIR(spec)
    const outDir = mkdtempSync(join(tmpdir(), 'oqf-e2e-'))

    try {
      writeGeneratedFiles(ir, outDir)

      const types = readFileSync(join(outDir, 'types.ts'), 'utf8')
      // User should have merged properties from BaseEntity + inline
      expect(types).toContain('export interface User')
      expect(types).toContain('id: string')
      expect(types).toContain('createdAt: string')
      expect(types).toContain('name: string')
      expect(types).toContain('email?: string')

      const hooks = readFileSync(join(outDir, 'hooks.ts'), 'utf8')
      expect(hooks).toContain('useListUsers')
      expect(hooks).toContain('useCreateUser')
    } finally {
      rmSync(outDir, { recursive: true })
    }
  })
})
```

**Step 2: Run test**

Run: `bun test tests/e2e.test.ts -- -t "allOf composition"`
Expected: PASS (if Task 2 was completed correctly)

**Step 3: Commit**

```
test(e2e): add integration test for allOf composition
```

---

### Task 11: Final Verification & Version Bump

**Step 1: Run full test suite**

Run: `bun test`
Expected: All tests pass

**Step 2: Run typecheck**

Run: `bun run typecheck`
Expected: No errors

**Step 3: Run build**

Run: `bun run build`
Expected: Builds successfully

**Step 4: Bump version to 0.3.0**

Update `package.json` version field from `"0.2.3"` to `"0.3.0"`.

**Step 5: Commit**

```
chore: bump version to 0.3.0
```
