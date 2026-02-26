# API Reference

apigen exposes a small public surface: two configuration functions, two TypeScript interfaces, and one CLI command. Everything else (loader, IR, generators) is internal.

## Functions

### `defineConfig(input: ConfigInput): Config`

Creates a fully resolved configuration object. This is the recommended way to define your apigen config in a configuration file (e.g. `apigen.config.ts`).

`defineConfig` delegates to `resolveConfig` internally -- it exists as a named entrypoint so config files read naturally.

```ts
import { defineConfig } from 'apigen'

export default defineConfig({
  input: './openapi.yaml',
  output: './src/api/generated',
  mock: true,
})
```

**Parameters**

| Name    | Type          | Description                |
|---------|---------------|----------------------------|
| `input` | `ConfigInput` | Partial configuration      |

**Returns** -- `Config` with all defaults applied.

---

### `resolveConfig(input: ConfigInput): Config`

Resolves a partial `ConfigInput` into a complete `Config` by applying default values. Useful when you build config objects programmatically rather than through a config file.

```ts
import { resolveConfig } from 'apigen'

const config = resolveConfig({ input: './spec.yaml' })
// config.output  => './src/api/generated'
// config.mock    => true
```

**Parameters**

| Name    | Type          | Description                |
|---------|---------------|----------------------------|
| `input` | `ConfigInput` | Partial configuration      |

**Returns** -- `Config` with all defaults applied.

---

## Interfaces

### `Config`

The fully resolved configuration object. Every field is required.

| Field    | Type      | Description                                                        |
|----------|-----------|--------------------------------------------------------------------|
| `input`  | `string`  | Path to the OpenAPI or Swagger spec file (JSON or YAML).           |
| `output` | `string`  | Directory where generated files are written.                       |
| `mock`   | `boolean` | Whether to generate mock data alongside types and hooks.           |

### `ConfigInput`

The input type accepted by `defineConfig` and `resolveConfig`. Only `input` is required; all other fields are optional and fall back to defaults.

| Field    | Type      | Required | Default                  | Description                                      |
|----------|-----------|----------|--------------------------|--------------------------------------------------|
| `input`  | `string`  | Yes      | --                       | Path to the OpenAPI or Swagger spec file.         |
| `output` | `string`  | No       | `'./src/api/generated'`  | Output directory for generated files.             |
| `mock`   | `boolean` | No       | `true`                   | Generate mock data files.                         |

---

## CLI

The CLI binary is `apigen`. It is registered in `package.json` under `bin` and available after install.

### `apigen generate`

Read an OpenAPI/Swagger spec and generate TypeScript files (types, TanStack Query hooks, mock data, test-mode provider, and barrel index).

```bash
apigen generate -i ./openapi.yaml
```

**Flags**

| Flag                     | Required | Default                 | Description                                          |
|--------------------------|----------|-------------------------|------------------------------------------------------|
| `-i, --input <path>`     | No       | *(interactive prompt)*  | Path or URL to the OpenAPI or Swagger spec file. When omitted, shows an interactive prompt. |
| `-o, --output <path>`    | No       | `./src/api/generated`   | Output directory for generated files.                |
| `--no-mock`              | No       | (mock enabled)          | Skip mock data generation.                           |
| `--split`                | No       | (disabled)              | Split output into per-tag feature folders.           |

> **Interactive mode:** When `-i` is omitted, apigen prompts you to choose between providing a local file path, a direct URL, or auto-discovering a spec from a base URL (tries well-known paths like `/v3/api-docs`, `/swagger.json`, `/openapi.json`).

**Examples**

```bash
# Generate into the default output directory
apigen generate -i ./petstore.yaml

# Custom output directory, no mocks
apigen generate -i ./spec.json -o ./src/generated --no-mock
```

**Generated files**

| File                     | Contents                                                     |
|--------------------------|--------------------------------------------------------------|
| `types.ts`               | TypeScript interfaces for schemas and operation params.      |
| `hooks.ts`               | TanStack Query `useQuery` / `useMutation` hooks per operation. |
| `mocks.ts`               | Mock data constants for each schema and operation response.  |
| `test-mode-provider.tsx` | React context provider to switch hooks to mock mode.         |
| `index.ts`               | Barrel file re-exporting all generated modules.              |

> When `--no-mock` is used, `mocks.ts` and `test-mode-provider.tsx` are not generated. When `--split` is used, output is organized into per-tag subdirectories.

---

## Internal modules

The following modules are implementation details and are **not** part of the public API:

- **loader** (`src/loader.ts`) -- reads and normalizes OpenAPI/Swagger specs.
- **ir** (`src/ir.ts`) -- extracts an intermediate representation from a parsed spec.
- **generators** (`src/generators/`) -- emit TypeScript source strings from the IR.
- **discover** (`src/discover.ts`) -- auto-discovers API specs at well-known paths.
- **writer** (`src/writer.ts`) -- writes generator output to disk.

These may change without notice between versions. Import only from the package entrypoint (`apigen`).
