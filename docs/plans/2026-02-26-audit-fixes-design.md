# Design: Fix All Audit Issues

**Date**: 2026-02-26
**Source**: Agent team audit (`audit-docs`) — 10 issues (3 medium, 7 low)
**Approach**: Surgical in-place edits to existing files + 2 new test files

---

## 1. Flowchart Fixes (`docs/diagrams/apigen-flowchart.md`)

### M1: Bundling scope
Replace the universal `[Bundle & resolve refs]` node with proper branching after version detection. The actual code paths are:
- File + OpenAPI 3.x → `bundle()` via `@redocly/openapi-core` (`loader.ts:69-71`)
- File + Swagger 2.0 → `convertObj()` only, return immediately (`loader.ts:64-66`)
- URL + any version → no `bundle()` call at all (`loader.ts:22-49`)

### L1: Mock conditional in split mode
Add `{Mock enabled?}` decision diamond inside the per-tag loop, mirroring the flat mode pattern. Mocks are only generated when `mock` is true (`writer.ts:90-91`).

### L2: Parsing asymmetry
Note that file parsing is extension-based (`.json` → `JSON.parse`, else → `parseYaml` at `loader.ts:57`) while URL parsing tries JSON first, falls back to YAML (`loader.ts:30-34`).

### L1 (related): Split mode provider conditional
Add conditional edge for `test-mode-provider.tsx` generation — only when mock enabled (`writer.ts:70-72`).

## 2. Sequence Diagram Fixes (`docs/diagrams/apigen-sequence.md`)

### M1 (same root cause): Bundling scope
Restructure the version detection `alt` block to nest inside the URL/file `alt`. Show `bundle()` only for file-based OpenAPI 3.x.

### M2: Missing api-fetch.ts participant
Add `GenApiFetch as generators/api-fetch.ts` participant. Add root-level generation messages before the tag loop:
1. `Writer->>GenProvider: generateProvider()` (if mock)
2. `Writer->>GenApiFetch: generateApiFetch()`
Both at `writer.ts:70-75`.

### L3: Argument label fixes
- `generateHooks` in split mode: `{ mock, providerImportPath, apiFetchImportPath }` (not `{ mock, paths }`)
- `generateIndexFile` per-tag: `{ mock, includeProvider: false }` (not `{ mock }`)
- `generateRootIndexFile`: `(tagSlugs, { mock })` (not just `tagSlugs`)

## 3. CLAUDE.md Updates

### M3: Build command
Update from simplified single command to actual 3-step pipeline:
```bash
bun build ./src/cli.ts --outdir dist --target node && \
bun build ./src/index.ts --outdir dist --target node --format esm && \
tsc --emitDeclarationOnly --outDir dist
```

### L4: Architecture tree
Add `├── api-fetch.ts` under `generators/` with description "→ shared apiFetch helper for split mode".

### L5: Document --split mode
Add `--split` to CLI options. Document split mode output structure (root: provider + api-fetch + index, per-tag: types + hooks + mocks + index).

### L6: Missing deps
Add to Key deps list:
- `@faker-js/faker` — realistic mock data generation
- `@inquirer/prompts` — interactive CLI prompts

## 4. New Test Files (basic coverage)

### L7a: `tests/generators/index-file.test.ts`
- Test `generateIndexFile()` with mock on → includes mocks + provider exports
- Test `generateIndexFile()` with mock off → only types + hooks exports
- Test `generateIndexFile({ includeProvider: false })` → no provider export
- Test `generateRootIndexFile(tagSlugs, { mock })` → re-exports all tag folders

### L7b: `tests/generators/api-fetch.test.ts`
- Test `generateApiFetch()` returns string
- Test output contains `apiFetch` function
- Test output includes eslint-disable and auto-generated headers

---

## Files Modified

| File | Action |
|------|--------|
| `docs/diagrams/apigen-flowchart.md` | Edit — fix bundling scope, add mock conditionals |
| `docs/diagrams/apigen-sequence.md` | Edit — fix bundling scope, add api-fetch participant, fix labels |
| `CLAUDE.md` | Edit — build cmd, architecture tree, split mode, deps |
| `tests/generators/index-file.test.ts` | Create — basic tests for generateIndexFile/generateRootIndexFile |
| `tests/generators/api-fetch.test.ts` | Create — basic tests for generateApiFetch |
