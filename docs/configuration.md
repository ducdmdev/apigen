# Configuration

All the ways to configure apigen: config file, CLI flags, and defaults.

## `defineConfig()`

Use `defineConfig` in a TypeScript config file to get type-checked configuration:

```ts
// apigen.config.ts
import { defineConfig } from 'apigen-tanstack'

export default defineConfig({
  input: './specs/petstore.yaml',
  output: './src/api/generated',
  mock: true,
  split: false,
  baseURL: 'https://api.example.com',
})
```

`defineConfig` accepts a `ConfigInput` object and returns a fully resolved `Config` with defaults applied. It is a pure helper for type safety -- it does not read files or trigger generation.

The CLI auto-searches for `apigen.config.ts` or `apigen.config.js` in the current directory when no `--config` flag is provided.

### Type signature

```ts
interface ConfigInput {
  input: string                  // required
  output?: string                // optional, defaults to './src/api/generated'
  mock?: boolean                 // optional, defaults to true
  split?: boolean                // optional, defaults to false
  baseURL?: string               // optional, prefix for all fetch paths
  apiFetchImportPath?: string    // optional, custom import path for apiFetch
}

interface Config {
  input: string
  output: string
  mock: boolean
  split: boolean
  baseURL?: string
  apiFetchImportPath?: string
}

function defineConfig(config: ConfigInput): Config
```

## Config Options

### `input` (required for config, optional for CLI)

Path or URL to your OpenAPI 3.x or Swagger 2.0 spec. Accepts local YAML/JSON files or `http://`/`https://` URLs.

```ts
defineConfig({
  input: './openapi.yaml',
})
```

```ts
defineConfig({
  input: './specs/petstore.json',
})
```

### `output`

Directory where generated files are written. Created automatically if it does not exist.

| | |
|---|---|
| **Type** | `string` |
| **Default** | `'./src/api/generated'` |

```ts
defineConfig({
  input: './openapi.yaml',
  output: './src/lib/api',
})
```

### `mock`

Whether to generate mock data in `mocks.ts`. When `true`, every schema gets a mock object with default values, and every operation gets a mock response constant.

| | |
|---|---|
| **Type** | `boolean` |
| **Default** | `true` |

```ts
defineConfig({
  input: './openapi.yaml',
  mock: false,  // skip mock generation
})
```

> **Note:** When `mock` is `false`, the `mocks.ts` and `test-mode-provider.tsx` files are not generated, and hooks do not include test mode logic.

### `split`

Split generated output into per-tag feature folders. Each tag gets its own directory with `types.ts`, `hooks.ts`, `mocks.ts`, and `index.ts`.

| | |
|---|---|
| **Type** | `boolean` |
| **Default** | `false` |

```ts
defineConfig({
  input: './openapi.yaml',
  split: true,
})
```

### `baseURL`

Base URL prefix for all generated fetch paths. When set, the generated `apiFetch` helper prepends this URL to every request path.

| | |
|---|---|
| **Type** | `string` |
| **Default** | *(none — paths are relative)* |

```ts
defineConfig({
  input: './openapi.yaml',
  baseURL: 'https://api.example.com',
})
```

### `apiFetchImportPath`

Custom import path for the `apiFetch` function. Use this when you have your own fetch wrapper and want generated hooks to import from it instead of using the built-in one.

| | |
|---|---|
| **Type** | `string` |
| **Default** | *(none — uses built-in apiFetch)* |

```ts
defineConfig({
  input: './openapi.yaml',
  apiFetchImportPath: '../lib/api-client',
})
```

## CLI Flags

```bash
npx apigen generate [flags]
```

### `--input` / `-i`

Path or URL to the OpenAPI/Swagger spec file. When omitted, an interactive prompt guides you through providing the spec via local file path, direct URL, or auto-discovery from a base URL.

```bash
npx apigen generate --input ./openapi.yaml
npx apigen generate -i ./specs/petstore.json
```

### `--output` / `-o`

Output directory. Defaults to `./src/api/generated`.

```bash
npx apigen generate -i ./openapi.yaml -o ./src/lib/api
```

### `--no-mock`

Skip mock data generation. This is the CLI equivalent of `mock: false` in the config.

```bash
npx apigen generate -i ./openapi.yaml --no-mock
```

### `--split`

Split generated output into per-tag feature folders. Each tag gets its own directory with `types.ts`, `hooks.ts`, `mocks.ts`, and `index.ts`. A shared `test-mode-provider.tsx` is placed at the output root.

```bash
npx apigen generate -i ./openapi.yaml --split
```

### `--config` / `-c`

Path to a config file. When omitted, the CLI searches for `apigen.config.ts` or `apigen.config.js` in the current directory.

```bash
npx apigen generate --config ./config/apigen.config.ts
npx apigen generate -c apigen.config.ts
```

### `--base-url`

Base URL prefix for all generated fetch paths. Overrides the `baseURL` config option.

```bash
npx apigen generate -i ./openapi.yaml --base-url https://api.example.com
```

### `--dry-run`

Preview the files that would be generated (with sizes) without writing anything. In a TTY, you are prompted to proceed after the preview. In non-TTY (CI), it prints and exits.

```bash
npx apigen generate -i ./openapi.yaml --dry-run
```

### Full example

```bash
npx apigen generate \
  --input ./specs/petstore.yaml \
  --output ./src/api \
  --base-url https://api.example.com \
  --no-mock \
  --split
```

## Peer Dependencies

Your consuming project must install:

| Package | Version |
|---------|---------|
| `react` | `^18 \|\| ^19` |
| `@tanstack/react-query` | `^5` |

The generated hooks import from `@tanstack/react-query` directly. The generated test-mode provider imports from `react`.

```bash
npm install react @tanstack/react-query
```

## Generated Files Reference

The output directory contains these files (mocks and provider are omitted when `--no-mock` is used):

| File | Description |
|------|-------------|
| `index.ts` | Barrel export -- re-exports all types, hooks, mocks, and the test-mode provider |
| `types.ts` | TypeScript interfaces for every schema in `components.schemas`, plus param interfaces for operations with path/query parameters |
| `hooks.ts` | One `useQuery` hook per GET operation, one `useMutation` hook per POST/PUT/PATCH/DELETE operation |
| `mocks.ts` | A mock constant per schema (`mockUser`, `mockPet`, etc.) and per operation response (`mockListPetsResponse`, etc.) |
| `test-mode-provider.tsx` | `ApiTestModeProvider` context and `useApiTestMode` hook for toggling between real fetch and mock data |

## Defaults Summary

| Option | CLI Flag | Default |
|--------|----------|---------|
| `input` | `--input` / `-i` | *(interactive prompt)* |
| `output` | `--output` / `-o` | `./src/api/generated` |
| `mock` | `--no-mock` to disable | `true` |
| `split` | `--split` | `false` |
| `baseURL` | `--base-url` | *(none)* |
| `apiFetchImportPath` | *(config only)* | *(none)* |
| — | `--config` / `-c` | *(auto-searches for apigen.config.ts)* |
| — | `--dry-run` | *(disabled)* |
