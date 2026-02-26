# Architecture

This document describes the apigen pipeline: how an OpenAPI spec enters the system and becomes generated TypeScript files.

## Pipeline Overview

```
                          +------------------+
                          |   CLI (cli.ts)   |
                          |  commander args  |
                          +--------+---------+
                                   |
                          resolve input path
                                   |
                                   v
                       +-----------+-----------+
                       | Spec Loader (loader.ts)|
                       | YAML/JSON parse        |
                       | Swagger 2.0 convert    |
                       | OpenAPI 3.0 bundle     |
                       +-----------+-----------+
                                   |
                          OpenAPI 3.x object
                                   |
                                   v
                       +-----------+-----------+
                       | IR Extraction (ir.ts)  |
                       | paths -> IROperation[] |
                       | schemas -> IRSchema[]  |
                       +-----------+-----------+
                                   |
                               IR object
                                   |
                                   v
                       +-----------+-----------+
                       |   Writer (writer.ts)   |
                       |   mkdir output dir     |
                       |   call each generator  |
                       |   write files to disk  |
                       +-----------+-----------+
                                   |
              +----------+---------+--------+-----------+
              |          |         |        |           |
              v          v         v        v           v
          types.ts   hooks.ts  mocks.ts  provider.tsx  index.ts
```

Each stage is a pure transformation. The loader produces a normalized OpenAPI 3.x object. The IR extractor converts that into a minimal intermediate representation. The generators are pure functions that take the IR (or nothing, for static files) and return a string. The writer orchestrates the generators and writes files to disk.

---

## Stage 1: Spec Loading (`src/loader.ts`)

**Entry point:** `loadSpec(filePath: string): Promise<Record<string, unknown>>`

### File detection

The loader decides the parse strategy based on file extension:

| Extension | Parser |
|---|---|
| `.json` | `JSON.parse` |
| anything else (`.yaml`, `.yml`, etc.) | `yaml` package (`parse` from `yaml`) |

### Version detection

After parsing, `detectSpecVersion` inspects the top-level keys:

```ts
type SpecVersion = 'swagger2' | 'openapi3' | 'unknown'
```

| Condition | Detected version |
|---|---|
| `spec.swagger` starts with `'2.'` | `swagger2` |
| `spec.openapi` starts with `'3.'` | `openapi3` |
| neither | `unknown` (throws an error) |

### Conversion and bundling

- **Swagger 2.0:** Automatically converted to OpenAPI 3.x using `swagger2openapi` (`converter.convertObj` with `{ patch: true, warnOnly: true }`). This means you can point apigen at legacy Swagger 2.0 specs without manual conversion.

- **OpenAPI 3.x:** Bundled using `@redocly/openapi-core` (`bundle({ ref: filePath, config })`). This resolves external `$ref` references, merges multi-file specs, and produces a single self-contained OpenAPI document.

The output of `loadSpec` is always a fully-resolved OpenAPI 3.x object, regardless of the input format.

---

## Stage 2: IR Extraction (`src/ir.ts`)

**Entry point:** `extractIR(spec: Record<string, unknown>): IR`

The Intermediate Representation (IR) is a simplified, generator-friendly data model. It strips away OpenAPI-specific nesting and gives generators exactly the data they need.

### IR Interfaces

#### `IR` -- top-level container

```ts
interface IR {
  operations: IROperation[]
  schemas: IRSchema[]
}
```

#### `IROperation` -- one API endpoint

```ts
interface IROperation {
  operationId: string     // from spec, or auto-generated as `${method}${sanitizedPath}`
  method: string          // 'get' | 'post' | 'put' | 'delete' | 'patch'
  path: string            // e.g. '/users/{userId}'
  pathParams: IRParam[]   // parameters where in='path'
  queryParams: IRParam[]  // parameters where in='query'
  requestBody: IRSchemaRef | null   // parsed from requestBody.content['application/json']
  responseSchema: IRSchemaRef | null // parsed from responses.200/201/default
  tags: string[]          // operation tags from spec
}
```

**operationId fallback:** If the spec does not define an `operationId`, one is synthesized by `generateOperationId(method, path)`. It uses smart heuristics: known action suffixes (`search`, `get-by-id`, `create`, `update`, `delete`, etc.) are recognized, and path segments are converted to PascalCase. Examples: `GET /users` becomes `listUsers`, `POST /users/{id}/search` becomes `searchUsers`, `DELETE /users/{id}` becomes `deleteUsers`.

**Response resolution order:** The extractor looks for a success response in this order: `200`, then `201`, then `default`. It only extracts the `application/json` content type.

#### `IRSchema` -- one named schema

```ts
interface IRSchema {
  name: string            // schema name from components.schemas key
  properties: IRProperty[]
  required: string[]      // names of required properties
}
```

#### `IRProperty` -- one property of a schema

```ts
interface IRProperty {
  name: string
  type: string            // mapped TypeScript type: 'string' | 'number' | 'boolean' | 'array' | 'object' | 'unknown'
  required: boolean       // true if in parent schema's required[]
  isArray: boolean        // true if OpenAPI type is 'array'
  itemType: string | null // mapped type of array items (if isArray)
  ref: string | null      // $ref string if property references another schema
  enumValues: string[] | null  // enum values if defined
}
```

#### `IRParam` -- one operation parameter

```ts
interface IRParam {
  name: string
  type: string            // mapped TypeScript type
  required: boolean
  location: 'path' | 'query'
}
```

#### `IRSchemaRef` -- a reference to a schema (used for request/response bodies)

```ts
interface IRSchemaRef {
  type: string            // mapped type, or 'array'
  ref: string | null      // $ref string, e.g. '#/components/schemas/User'
  isArray: boolean        // true if the top-level type is 'array'
  itemRef: string | null  // $ref of array items (if isArray)
}
```

### Type mapping function

`mapOpenApiType` converts OpenAPI `type`/`format` pairs to TypeScript-compatible type strings:

```ts
function mapOpenApiType(schema): string {
  'integer' | 'number' -> 'number'
  'boolean'            -> 'boolean'
  'string'             -> 'string'   (including date and date-time formats)
  'array'              -> 'array'
  'object'             -> 'object'
  default              -> 'unknown'
}
```

### Extraction logic

1. **Operations:** Iterates over `spec.paths`. For each path, iterates over the five supported HTTP methods (`get`, `post`, `put`, `delete`, `patch`). For each operation found, it extracts parameters (splitting into `pathParams` and `queryParams`), the request body (from `application/json` content), and the response schema.

2. **Schemas:** Iterates over `spec.components.schemas`. For each schema, it extracts every property with its type, array status, `$ref` target, and enum values.

---

## Stage 3: Generators (`src/generators/*.ts`)

Each generator is a **pure function**: it takes the IR (or no arguments for static generators) and returns a string of TypeScript source code. No file I/O happens here.

### Template-string approach

Generators build output by assembling arrays of string lines, then joining with `\n`. This is deliberate: template strings with complex indentation are hard to read and maintain. The line-array approach keeps the logic explicit.

```ts
// Typical generator pattern
function generateSomething(ir: IR): string {
  const parts: string[] = []
  parts.push('/* header */')
  parts.push('')
  for (const item of ir.schemas) {
    parts.push(generateOneItem(item))
    parts.push('')
  }
  return parts.join('\n')
}
```

### Generator inventory

| Generator | File | Signature | Description |
|---|---|---|---|
| `generateTypes` | `generators/types.ts` | `(ir: IR) => string` | Schema interfaces + param interfaces |
| `generateApiFetch` | `generators/api-fetch.ts` | `(options?) => string` | Shared apiFetch helper (used in split mode) |
| `generateHooks` | `generators/hooks.ts` | `(ir: IR, options?) => string` | useQuery/useMutation hooks, apiFetch helper, imports |
| `generateMocks` | `generators/mocks.ts` | `(ir: IR) => string` | Schema mocks + response mocks |
| `generateProvider` | `generators/provider.ts` | `() => string` | Static ApiTestModeProvider context (no IR needed) |
| `generateIndexFile` | `generators/index-file.ts` | `(options?) => string` | Barrel re-exports (conditional on mock) |
| `generateRootIndexFile` | `generators/index-file.ts` | `(tagSlugs, options?) => string` | Root index re-exporting per-tag feature folders |

### types generator (`generators/types.ts`)

Internally uses two sub-functions:

- **`generateSchemaInterface(schema: IRSchema)`** -- emits one `export interface` block. Uses `tsType(prop)` to convert `IRProperty` to TypeScript type syntax (handling arrays, `$ref` resolution, and primitive types).
- **`generateParamsInterface(op: IROperation)`** -- emits `export interface <OperationId>Params { ... }` if the operation has any path or query params. Returns `null` if there are no params.

### hooks generator (`generators/hooks.ts`)

The most complex generator. Key internal functions:

- **`pathToQueryKey(path, pathParams)`** -- converts a URL path to a TanStack Query key array. Static segments become string literals, path params become runtime references.
- **`buildFetchPath(path)`** -- converts `'/users/{userId}'` to a template literal `` `/users/${params.userId}` `` or a plain string if no params.
- **`collectImportedTypes(ir)`** -- scans all operations to determine which types from `types.ts` need importing.
- **`collectMockImports(ir)`** -- scans all operations to determine which mock constants from `mocks.ts` need importing.
- **`generateQueryHook(op)`** -- emits a `useQuery`-based hook for GET operations.
- **`generateMutationHook(op)`** -- emits a `useMutation`-based hook for non-GET operations.

### mocks generator (`generators/mocks.ts`)

Internal functions:

- **`defaultValueForType(type)`** -- returns the default mock literal for a primitive type.
- **`mockPropertyValue(prop, schemas)`** -- determines the mock value for a single property, handling `$ref`, arrays, enums, and primitives.
- **`generateSchemaMock(schema, allSchemas)`** -- emits one `export const mock<Name>: <Name> = { ... }`.
- **`generateResponseMock(op)`** -- emits one `export const mock<OpId>Response` that aliases or wraps the schema mock.

### provider generator (`generators/provider.ts`)

Returns a static string literal. This generator does not use the IR because the provider code is always identical regardless of the spec.

### index-file generator (`generators/index-file.ts`)

Returns a static string literal with `export * from` statements for each of the other four modules.

---

## Stage 4: File Writer (`src/writer.ts`)

**Entry point:** `writeGeneratedFiles(ir: IR, outputDir: string, options?: { mock?: boolean; split?: boolean; baseURL?: string; apiFetchImportPath?: string; dryRun?: boolean }): FileInfo[] | void`

When `mock` is `false`, mocks and provider files are skipped. When `split` is `true`, output is organized into per-tag feature folders. When `dryRun` is `true`, returns an array of `FileInfo` objects (path + size) without writing. The `baseURL` and `apiFetchImportPath` options are passed through to the hooks and api-fetch generators.

The writer is the orchestrator. It:

1. Creates the output directory (recursively, using `mkdirSync` with `{ recursive: true }`).
2. Calls each generator function with the IR.
3. Writes each result to the corresponding file using `writeFileSync`.

```ts
function writeGeneratedFiles(ir: IR, outputDir: string, options?: { mock?: boolean; split?: boolean }): void {
  const mock = options?.mock ?? true
  const split = options?.split ?? false

  if (split) {
    writeSplit(ir, outputDir, mock)   // per-tag feature folders
  } else {
    writeFlat(ir, outputDir, mock)    // single directory
  }
}
```

The mapping of generators to output files is:

| Generator | Output file |
|---|---|
| `generateTypes(ir)` | `types.ts` |
| `generateHooks(ir)` | `hooks.ts` |
| `generateMocks(ir)` | `mocks.ts` |
| `generateProvider()` | `test-mode-provider.tsx` |
| `generateIndexFile()` | `index.ts` |

Note that `generateProvider` and `generateIndexFile` receive no arguments -- they emit static content.

---

## How to Add a New Generator

To add a new generated file (for example, `api-client.ts`), follow these steps:

1. **Create the generator function** in `src/generators/your-file.ts`:

   ```ts
   import type { IR } from '../ir'

   function generateYourFile(ir: IR): string {
     const parts: string[] = []
     parts.push('/* eslint-disable */')
     parts.push('/* This file is auto-generated by apigen. Do not edit. */')
     parts.push('')
     // ... build your output using ir.operations and ir.schemas
     return parts.join('\n')
   }

   export { generateYourFile }
   ```

2. **Register it in the writer** (`src/writer.ts`):

   ```ts
   import { generateYourFile } from './generators/your-file'

   // Inside writeGeneratedFiles:
   writeFileSync(join(outputDir, 'your-file.ts'), generateYourFile(ir), 'utf8')
   ```

3. **Optionally re-export from index** -- if the new file's exports should be available through the barrel file, update `generators/index-file.ts` to include `export * from './your-file'`.

The key constraint is that generators must be **pure functions**: `IR` in, `string` out. They must not perform I/O or depend on external state. This keeps them testable and composable.

---

## CLI Entry Point (`src/cli.ts`)

The CLI ties everything together:

```
apigen generate -i <spec-path> [-o <output-dir>] [--config <path>] [--base-url <url>] [--dry-run] [--split] [--no-mock]
```

| Flag | Default | Description |
|---|---|---|
| `-i, --input <path>` | *(interactive prompt)* | Path or URL to OpenAPI or Swagger spec file |
| `-o, --output <path>` | `./src/api/generated` | Output directory for generated files |
| `--no-mock` | mocks enabled | Skip mock data generation |
| `--split` | disabled | Split output into per-tag feature folders |
| `-c, --config <path>` | *(auto-searches)* | Path to config file |
| `--base-url <url>` | *(none)* | Base URL prefix for fetch paths |
| `--dry-run` | disabled | Preview files without writing |

### Config file loading

The CLI loads configuration in this priority order:

1. **Explicit `--config` flag** — loads the specified file
2. **Auto-search** — looks for `apigen.config.ts` or `apigen.config.js` in the current directory
3. **CLI flags** — override any config file values
4. **Interactive wizard** — runs when no config file and no `-i` flag are provided

Config files are loaded via dynamic `import()` and must export a `ConfigInput` object (or use `defineConfig` for type safety).

### Pipeline

Internally, the CLI runs the pipeline in sequence:

```ts
const fileConfig = await loadConfigFile(configPath)           // Load config file (if found)
const config = resolveConfig({ ...fileConfig, ...cliFlags })  // Merge with CLI overrides
const inputValue = config.input || (await promptForInput())   // Interactive if no input
const spec = await loadSpec(inputPath)                        // Stage 1: load + normalize
const ir = extractIR(spec)                                    // Stage 2: extract IR
writeGeneratedFiles(ir, outputPath, { mock, split, baseURL, apiFetchImportPath, dryRun })  // Stage 3+4
```

When no config file is found and `-i` is omitted, the full interactive wizard runs: `promptForInput()` for spec source, then `promptForConfig()` for output/mock/split/baseURL options, with an option to save as `apigen.config.ts`.

The `--dry-run` flag invokes `collectFileInfo()` to calculate output file sizes without writing, then displays a preview. In TTY mode, the user is prompted to confirm before writing.

The CLI logs the number of operations and schemas found, and the output directory path.

---

### Auto-Discovery (`src/discover.ts`)

**Entry point:** `discoverSpec(baseUrl: string): Promise<{ url: string; version: SpecVersion }>`

When the user selects "Auto-discover from base URL" in the interactive prompt, this module tries well-known API documentation paths in order:

| Path | Framework |
|---|---|
| `/v3/api-docs` | Spring Boot (SpringDoc) |
| `/swagger.json` | Swagger UI / Express swagger-jsdoc |
| `/openapi.json` | Common convention |
| `/api-docs` | Older Spring Boot (Springfox) |
| `/docs/openapi.json` | FastAPI |

Each path is fetched with a 3-second timeout. The response is parsed as JSON (with YAML fallback) and validated with `detectSpecVersion()`. The first valid response wins. If all fail, an error lists every path tried.

---

## Configuration (`src/config.ts`)

For programmatic use, apigen exports `defineConfig` and `resolveConfig`:

```ts
interface ConfigInput {
  input: string                  // required: path or URL to spec
  output?: string                // default: './src/api/generated'
  mock?: boolean                 // default: true
  split?: boolean                // default: false
  baseURL?: string               // prefix for all fetch paths
  apiFetchImportPath?: string    // custom import path for apiFetch
}

interface Config {
  input: string
  output: string
  mock: boolean
  split: boolean
  baseURL?: string
  apiFetchImportPath?: string
}
```

`defineConfig(input)` is a convenience wrapper around `resolveConfig(input)` that fills in defaults. This is exported from the package's main entry point (`src/index.ts`) for use in config files or build tool integrations.
