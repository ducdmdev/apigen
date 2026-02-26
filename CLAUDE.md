# CLAUDE.md — apigen

## Project Overview

apigen is a standalone npm CLI that reads OpenAPI 3.0+ and Swagger 2.0 specs and generates TanStack Query v5 React hooks, TypeScript types, mock data, and a React test mode provider.

## Tech Stack

- **Runtime**: Node.js >=18
- **Language**: TypeScript 5.9, strict mode, ES2022 target, ESM only
- **Package manager**: Bun
- **Build**: `bun build ./src/cli.ts --outdir dist --target node && bun build ./src/index.ts --outdir dist --target node --format esm && tsc --emitDeclarationOnly --outDir dist`
- **Test framework**: Vitest
- **Key deps**: commander, @redocly/openapi-core, swagger2openapi, yaml, @faker-js/faker, @inquirer/prompts

## Commands

```bash
bun test          # run tests (88 tests across 13 files)
bun run typecheck # tsc --noEmit
bun run build     # compile to dist/
```

## Architecture

Pipeline: CLI → `loadSpec()` → `extractIR()` → generators → `writeGeneratedFiles()`

```
src/
├── cli.ts              # Commander CLI entry point
├── config.ts           # defineConfig / resolveConfig (public API)
├── index.ts            # Public exports (config only)
├── loader.ts           # Reads YAML/JSON, converts Swagger 2→3, bundles refs
├── ir.ts               # Extracts IR (operations + schemas) from OpenAPI spec
├── discover.ts         # Auto-discovers API specs at well-known paths
├── writer.ts           # Orchestrates all generators, writes to disk
├── generators/
│   ├── types.ts        # IR → TypeScript interfaces
│   ├── hooks.ts        # IR → useQuery/useMutation hooks
│   ├── mocks.ts        # IR → static mock data constants
│   ├── provider.ts     # → React test mode context provider
│   ├── index-file.ts   # → barrel re-exports
│   └── api-fetch.ts    # → shared apiFetch helper (split mode)
└── types/
    └── swagger2openapi.d.ts
```

## Code Conventions

- **Pure functions** — generators are `(ir: IR) => string`, no side effects
- **Template string codegen** — no AST manipulation, plain string concatenation
- **Explicit exports** — `export { fn }` and `export type { T }`, no default exports
- **camelCase** functions/variables, **PascalCase** types/interfaces
- **IR prefix** for intermediate representation types: `IROperation`, `IRSchema`, `IRParam`, `IRProperty`, `IRSchemaRef`

## Test Conventions

- Tests live in `tests/` mirroring `src/` structure
- Naming: `{module}.test.ts`
- Fixtures in `tests/fixtures/` (petstore-oas3.yaml, petstore-swagger2.yaml)
- E2E tests create temp dirs, run full pipeline, verify output, clean up
- Use `describe`/`it`/`expect` from vitest

## Public API

Only config is exported publicly from `src/index.ts`:
- `defineConfig(input)` / `resolveConfig(input)`
- `Config` / `ConfigInput` types

All other modules (loader, ir, generators, writer) are internal.

## Generated Output

The CLI produces 5 files in the output directory:
- `types.ts` — interfaces from schemas
- `hooks.ts` — useQuery (GET) / useMutation (POST/PUT/DELETE/PATCH) with apiFetch helper
- `mocks.ts` — static mock constants per schema and response
- `test-mode-provider.tsx` — React context toggling mock vs real
- `index.ts` — barrel re-exports

With `--split` flag, output is organized into per-tag feature folders:
- Root: `test-mode-provider.tsx`, `api-fetch.ts`, `index.ts` (re-exports all tags)
- Per-tag: `{tag}/types.ts`, `{tag}/hooks.ts`, `{tag}/mocks.ts`, `{tag}/index.ts`

All generated files include `/* eslint-disable */` and `/* auto-generated */` headers.

## Important Notes

- ESM only (`"type": "module"`) — no CommonJS
- Only `dist/` is published to npm
- Swagger 2.0 specs are auto-converted to OpenAPI 3.x before processing
- Hook names derived from operationId: `use{OperationId}`
- Mock names: `mock{SchemaName}`, `mock{OperationId}Response`
- Query keys derived from URL path segments
