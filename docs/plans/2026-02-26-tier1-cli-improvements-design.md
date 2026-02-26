# Tier 1 CLI Improvements Design

**Date**: 2026-02-26
**Version target**: v0.3.0
**Breaking changes**: None — all features opt-in

---

## Scope

8 items — 6 from the CLI audit Tier 1 recommendations + 2 interactive enhancements:

1. Config file loading (`--config` flag + auto-search)
2. Extended ConfigInput (`split`, `baseURL`, `apiFetchImportPath`)
3. `--dry-run` flag
4. Improved error messages
5. Circular reference detection
6. allOf composition support
7. Interactive config init wizard (using `@inquirer/prompts`)
8. Dry-run confirmation prompt

---

## 1. IR Hardening

### 1a. Circular Reference Detection

**File**: `src/ir.ts`

Track visited schema names during `extractIR()` using a `Set<string>`. When processing component schemas, if a `$ref` resolves to a schema already in the visiting set, emit the property with `ref` pointing to that schema name instead of recursing. This naturally breaks the cycle since generators already handle `ref` properties.

Emit `console.warn("Circular reference detected: ${schemaName} → ${refName}, using type reference")`.

No generator changes needed.

### 1b. allOf Composition

**File**: `src/ir.ts`

Add `resolveAllOf(allOfArray, schemasDef)` that merges properties from all variants:

- For `$ref` variants: look up referenced schema in `schemasDef`, collect its properties
- For inline variants: collect properties directly
- Merge all properties (later variants override on name collision)
- Union all `required` arrays

Wire into `extractIR()` at:
- Top-level schema loop (when `schemaDef.allOf` exists)
- `extractInlineSchema()` (when inline schemas use allOf)

Property merging only — no nested allOf-within-allOf in this release.

---

## 2. Config Expansion

### 2a. Extended Types

**File**: `src/config.ts`

```typescript
interface ConfigInput {
  input: string
  output?: string              // default: './src/api/generated'
  mock?: boolean               // default: true
  split?: boolean              // NEW — default: false
  baseURL?: string             // NEW — no default
  apiFetchImportPath?: string  // NEW — no default
}

interface Config {
  input: string
  output: string
  mock: boolean
  split: boolean               // NEW
  baseURL?: string             // NEW
  apiFetchImportPath?: string  // NEW
}
```

### 2b. Pipeline Wiring

**`cli.ts`**: Pass full `Config` to `writeGeneratedFiles()`.

**`writer.ts`**: Accept `Config` (or equivalent options) and pass `baseURL` + `apiFetchImportPath` to generators.

**`generators/hooks.ts`**: When `baseURL` is set, generated inline `apiFetch` uses `` `${baseURL}${path}` ``. The `apiFetchImportPath` option is already supported — just needs to flow from config.

**`generators/api-fetch.ts`**: Accept optional `baseURL`, bake into generated function.

### 2c. Config File Loader

**File**: `src/cli.ts`

```typescript
async function loadConfigFile(configPath: string): Promise<ConfigInput> {
  const resolved = resolve(configPath)
  const module = await import(pathToFileURL(resolved).toString())
  return module.default ?? module
}

async function findConfigFile(): Promise<string | null> {
  for (const name of ['apigen.config.ts', 'apigen.config.js']) {
    if (existsSync(resolve(name))) return resolve(name)
  }
  return null
}
```

Format: TS/JS only via `import()`. No JSON config.
Search order: `apigen.config.ts`, `apigen.config.js`.
CLI flags override config file values.

### 2d. Interactive Config Init Wizard

**File**: `src/cli.ts`

**Trigger**: User runs `apigen generate` without `-i` and no config file exists.

After the existing spec source prompt (`promptForInput()`) completes, present config questions:

```
? Output directory: (./src/api/generated)
? Generate mock data? (Y/n)
? Split output by API tags? (y/N)
? Base URL for API calls: (leave empty for relative paths)
? Save as apigen.config.ts? (Y/n)
```

Prompt types:
- `input()` — output directory and base URL (with defaults)
- `confirm()` — mock, split, and save config

If user confirms save, write `apigen.config.ts`:

```typescript
import { defineConfig } from 'apigen-tanstack'

export default defineConfig({
  input: './openapi.yaml',
  output: './src/api/generated',
  mock: true,
  split: false,
  baseURL: 'https://api.example.com',
})
```

Helper function:

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

**Skip conditions**: When config file already exists OR when `-i` is provided, skip the wizard entirely.

---

## 3. CLI Flags

### New flags on `generate` command

```
-c, --config <path>   Path to config file (auto-searches if omitted)
--dry-run              Preview without writing files
--base-url <url>       Prefix for all fetch paths
```

### `--dry-run` behavior

Run full pipeline (load, IR, generate) but don't write. Print summary:

```
Dry run — files that would be generated:
  ./src/api/generated/types.ts      (2.1 KB, 12 interfaces)
  ./src/api/generated/hooks.ts      (3.4 KB, 8 hooks)
  ./src/api/generated/mocks.ts      (1.8 KB, 12 mocks)
  ./src/api/generated/test-mode-provider.tsx  (0.5 KB)
  ./src/api/generated/index.ts      (0.2 KB)
```

Implementation: Add `dryRun` option to `writeGeneratedFiles`. When true, generate content strings, return metadata (paths + sizes), CLI prints summary.

### `--dry-run` interactive confirmation

After the preview, if stdin is a TTY, prompt with `confirm()`:

```
? Proceed with generation? (Y/n)
```

- **Yes**: Run the actual write.
- **No**: Exit with `console.log('Cancelled.')` and exit code 0.
- **Non-TTY** (piped stdin / CI): Skip the confirm, just print preview and exit.

```typescript
if (options.dryRun) {
  printDryRunSummary(files)
  if (!process.stdin.isTTY) return
  const proceed = await confirm({ message: 'Proceed with generation?' })
  if (!proceed) { console.log('Cancelled.'); return }
  // fall through to actual write
}
```

---

## 4. Error Messages

Improve at 3 locations:

### `loader.ts`

- File not found: `"Cannot find spec file: ./openapi.yaml. Check the path and try again."`
- Parse failure: `"Failed to parse ./spec.yaml: [error]. Ensure the file is valid YAML or JSON."`

### `ir.ts`

- No paths: `console.warn("Warning: Spec has no 'paths' — 0 operations extracted.")`
- Empty schema: `console.warn("Warning: Schema 'User' has no properties, skipping.")`

Approach: Better context on existing throws + `console.warn()` for non-fatal issues. No new error types.

---

## Implementation Order (Bottom-Up)

1. IR hardening (circular refs + allOf) — self-contained in `ir.ts`
2. Config expansion — types + resolveConfig + wire through writer/generators
3. Config file loader — new functions in `cli.ts`
4. CLI flags (`--config`, `--dry-run`, `--base-url`) — tie everything together
5. Error messages — improve across loader + ir
6. Interactive config init wizard — `promptForConfig()` in `cli.ts`
7. Dry-run confirmation — `confirm()` after preview with TTY check

Each step independently testable with TDD.

---

## Files Changed

| File | Changes |
|------|---------|
| `src/ir.ts` | Circular ref detection, allOf resolution, warning messages |
| `src/config.ts` | 3 new fields in ConfigInput/Config |
| `src/cli.ts` | Config loader, auto-search, --config/--dry-run/--base-url flags, config init wizard, dry-run confirmation |
| `src/writer.ts` | Accept Config, pass baseURL/apiFetchImportPath to generators, dry-run support |
| `src/generators/hooks.ts` | Use baseURL in generated apiFetch |
| `src/generators/api-fetch.ts` | Accept baseURL param |
| `src/loader.ts` | Better error messages |
| `tests/ir.test.ts` | Circular ref + allOf tests |
| `tests/config.test.ts` | New config fields tests |
| `tests/e2e.test.ts` | Config file + dry-run integration tests |
