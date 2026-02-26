# Audit Fixes Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Fix all 10 issues (3 medium, 7 low) found by the audit-docs agent team across diagrams, docs, and tests.

**Architecture:** Surgical edits to 2 Mermaid diagram files and CLAUDE.md, plus 2 new test files matching existing patterns in `tests/generators/`.

**Tech Stack:** Mermaid, Markdown, Vitest

---

### Task 1: Fix Flowchart — Bundling Scope and Conditionals

**Files:**
- Modify: `docs/diagrams/apigen-flowchart.md`

**Step 1: Replace the flowchart content**

Replace the entire `mermaid` code block in `docs/diagrams/apigen-flowchart.md` with:

~~~markdown
```mermaid
flowchart TD
    A[CLI: apigen generate] --> B{Input provided?}
    B -->|Yes| C[Resolve input path or URL]
    B -->|No| D[Interactive prompt]
    D --> D1{Source type?}
    D1 -->|File| C
    D1 -->|URL| C
    D1 -->|Auto-discover| E[discoverSpec: probe well-known paths]
    E --> C

    C --> F{Is URL?}
    F -->|Yes| G[Fetch spec via HTTP]
    F -->|No| H[Read file from disk]

    G --> G1[Try JSON.parse, fallback to YAML]
    G1 --> G2{Spec version?}
    G2 -->|Swagger 2.0| G3[Convert to OpenAPI 3.x]
    G2 -->|OpenAPI 3.x| G4[Return parsed spec]
    G2 -->|Unknown| ERR[Throw error]
    G3 --> G4

    H --> H1[Parse by extension: .json → JSON, else YAML]
    H1 --> H2{Spec version?}
    H2 -->|Swagger 2.0| H3[Convert to OpenAPI 3.x]
    H2 -->|OpenAPI 3.x| H4[Bundle & resolve refs via redocly]
    H2 -->|Unknown| ERR
    H3 --> M
    H4 --> M
    G4 --> M

    M[extractIR: walk paths & schemas]
    M --> N[IR: operations + schemas]

    N --> O{Split mode?}
    O -->|No| P[writeFlat: single output dir]
    O -->|Yes| Q[writeSplit: per-tag feature folders]

    P --> R[Generate types.ts]
    P --> S[Generate hooks.ts]
    P --> T{Mock enabled?}
    T -->|Yes| U[Generate mocks.ts]
    T -->|Yes| V[Generate test-mode-provider.tsx]
    T -->|No| W[Skip mocks]
    P --> X[Generate index.ts barrel]

    Q --> Q1{Mock enabled?}
    Q1 -->|Yes| Q2[Generate shared test-mode-provider.tsx]
    Q1 -->|No| Q3[Skip shared provider]
    Q2 --> Q4[Generate shared api-fetch.ts]
    Q3 --> Q4
    Q4 --> Y[Group operations by tag]
    Y --> Z{For each tag}
    Z --> Z1[Generate types.ts + hooks.ts]
    Z --> Z2{Mock enabled?}
    Z2 -->|Yes| Z3[Generate mocks.ts]
    Z2 -->|No| Z4[Skip mocks]
    Z3 --> Z5[Generate index.ts per tag]
    Z4 --> Z5
    Z1 --> Z5
    Z5 --> AA[Generate root index.ts re-exports]

    R --> DONE[Done: files written to output dir]
    S --> DONE
    U --> DONE
    V --> DONE
    X --> DONE
    W --> DONE
    AA --> DONE
```
~~~

**Step 2: Verify the diagram renders**

Visually check the mermaid renders without syntax errors (open in VS Code preview or paste at https://mermaid.live).

**Step 3: Commit**

```bash
git add docs/diagrams/apigen-flowchart.md
git commit -m "fix(docs): correct flowchart bundling scope and add mock conditionals"
```

---

### Task 2: Fix Sequence Diagram — Bundling Scope, api-fetch, Labels

**Files:**
- Modify: `docs/diagrams/apigen-sequence.md`

**Step 1: Replace the sequence diagram content**

Replace the entire `mermaid` code block in `docs/diagrams/apigen-sequence.md` with:

~~~markdown
```mermaid
sequenceDiagram
    actor User
    participant CLI as cli.ts
    participant Discover as discover.ts
    participant Loader as loader.ts
    participant Converter as swagger2openapi
    participant Bundler as @redocly/openapi-core
    participant IR as ir.ts (extractIR)
    participant Writer as writer.ts
    participant GenTypes as generators/types.ts
    participant GenHooks as generators/hooks.ts
    participant GenMocks as generators/mocks.ts
    participant GenProvider as generators/provider.ts
    participant GenApiFetch as generators/api-fetch.ts
    participant GenIndex as generators/index-file.ts
    participant FS as File System

    User->>CLI: apigen generate -i spec.yaml -o ./out

    alt No --input flag
        CLI->>User: Interactive prompt (file / URL / discover)
        User-->>CLI: Selection + value
        opt Auto-discover selected
            CLI->>Discover: discoverSpec(baseUrl)
            loop Each well-known path
                Discover->>Discover: fetch(baseUrl + path)
                Discover->>Discover: detectSpecVersion(parsed)
            end
            Discover-->>CLI: { url, version }
        end
    end

    CLI->>Loader: loadSpec(inputPath)
    activate Loader

    alt Input is URL
        Loader->>Loader: fetch(url)
        Loader->>Loader: Try JSON.parse, fallback to parseYaml
        Loader->>Loader: detectSpecVersion(parsed)
        alt Swagger 2.0
            Loader->>Converter: convertObj(spec)
            Converter-->>Loader: OpenAPI 3.x spec
        else OpenAPI 3.x
            Note over Loader: Return parsed spec directly (no bundling)
        end
    else Input is file
        Loader->>FS: readFileSync(path)
        FS-->>Loader: raw content
        Loader->>Loader: Parse by extension (.json → JSON, else YAML)
        Loader->>Loader: detectSpecVersion(parsed)
        alt Swagger 2.0
            Loader->>Converter: convertObj(spec)
            Converter-->>Loader: OpenAPI 3.x spec
        else OpenAPI 3.x
            Loader->>Bundler: bundle(ref, config)
            Bundler-->>Loader: Bundled & resolved spec
        end
    end

    Loader-->>CLI: OpenAPI 3.x spec object
    deactivate Loader

    CLI->>IR: extractIR(spec)
    activate IR
    IR->>IR: Walk spec.paths → IROperation[]
    IR->>IR: Extract path params, query params
    IR->>IR: Extract requestBody schema refs
    IR->>IR: Extract response schema refs
    IR->>IR: Inline schemas → IRSchema[]
    IR->>IR: Walk components.schemas → IRSchema[]
    IR-->>CLI: { operations, schemas }
    deactivate IR

    CLI->>Writer: writeGeneratedFiles(ir, outputDir, options)
    activate Writer

    alt Flat mode (default)
        Writer->>GenTypes: generateTypes(ir)
        GenTypes-->>Writer: types.ts content
        Writer->>GenHooks: generateHooks(ir, { mock })
        GenHooks-->>Writer: hooks.ts content
        opt Mock enabled
            Writer->>GenMocks: generateMocks(ir)
            GenMocks-->>Writer: mocks.ts content
            Writer->>GenProvider: generateProvider()
            GenProvider-->>Writer: test-mode-provider.tsx content
        end
        Writer->>GenIndex: generateIndexFile({ mock })
        GenIndex-->>Writer: index.ts content
        Writer->>FS: writeFileSync(outputDir/*)
    else Split mode (--split)
        Writer->>Writer: groupOperationsByTag(operations)
        opt Mock enabled
            Writer->>GenProvider: generateProvider()
            GenProvider-->>Writer: test-mode-provider.tsx content
            Writer->>FS: writeFileSync(outputDir/test-mode-provider.tsx)
        end
        Writer->>GenApiFetch: generateApiFetch()
        GenApiFetch-->>Writer: api-fetch.ts content
        Writer->>FS: writeFileSync(outputDir/api-fetch.ts)
        loop Each tag group
            Writer->>Writer: buildSubsetIR(ops, schemas)
            Writer->>GenTypes: generateTypes(subsetIR)
            Writer->>GenHooks: generateHooks(subsetIR, { mock, providerImportPath, apiFetchImportPath })
            opt Mock enabled
                Writer->>GenMocks: generateMocks(subsetIR)
            end
            Writer->>GenIndex: generateIndexFile({ mock, includeProvider: false })
            Writer->>FS: writeFileSync(outputDir/tag/*)
        end
        Writer->>GenIndex: generateRootIndexFile(tagSlugs, { mock })
        Writer->>FS: writeFileSync(outputDir/index.ts)
    end

    Writer-->>CLI: void
    deactivate Writer

    CLI->>User: "Generated files written to ./out"
```
~~~

**Step 2: Verify the diagram renders**

Visually check the mermaid renders without syntax errors.

**Step 3: Commit**

```bash
git add docs/diagrams/apigen-sequence.md
git commit -m "fix(docs): correct sequence diagram bundling scope, add api-fetch, fix labels"
```

---

### Task 3: Update CLAUDE.md — Build Command, Architecture Tree, Split Mode, Deps

**Files:**
- Modify: `CLAUDE.md`

**Step 1: Update Build command (line 12)**

Replace:
```
- **Build**: `bun build ./src/cli.ts --outdir dist --target node`
```
With:
```
- **Build**: `bun build ./src/cli.ts --outdir dist --target node && bun build ./src/index.ts --outdir dist --target node --format esm && tsc --emitDeclarationOnly --outDir dist`
```

**Step 2: Update Key deps (line 14)**

Replace:
```
- **Key deps**: commander, @redocly/openapi-core, swagger2openapi, yaml
```
With:
```
- **Key deps**: commander, @redocly/openapi-core, swagger2openapi, yaml, @faker-js/faker, @inquirer/prompts
```

**Step 3: Add api-fetch.ts to Architecture tree (after line 42)**

Replace:
```
│   ├── provider.ts     # → React test mode context provider
│   └── index-file.ts   # → barrel re-exports
```
With:
```
│   ├── provider.ts     # → React test mode context provider
│   ├── index-file.ts   # → barrel re-exports
│   └── api-fetch.ts    # → shared apiFetch helper (split mode)
```

**Step 4: Add split mode to Generated Output section (after line 78)**

After the line `- `index.ts` — barrel re-exports`, add:

```

With `--split` flag, output is organized into per-tag feature folders:
- Root: `test-mode-provider.tsx`, `api-fetch.ts`, `index.ts` (re-exports all tags)
- Per-tag: `{tag}/types.ts`, `{tag}/hooks.ts`, `{tag}/mocks.ts`, `{tag}/index.ts`
```

**Step 5: Commit**

```bash
git add CLAUDE.md
git commit -m "docs: update CLAUDE.md with build cmd, api-fetch, split mode, deps"
```

---

### Task 4: Write tests for generateIndexFile

**Files:**
- Create: `tests/generators/index-file.test.ts`

**Step 1: Write the test file**

```typescript
import { describe, it, expect } from 'vitest'
import { generateIndexFile, generateRootIndexFile } from '../../src/generators/index-file'

describe('generateIndexFile', () => {
  it('includes types, hooks, mocks, and provider when mock is enabled', () => {
    const output = generateIndexFile({ mock: true })

    expect(output).toContain("export * from './types'")
    expect(output).toContain("export * from './hooks'")
    expect(output).toContain("export * from './mocks'")
    expect(output).toContain("export * from './test-mode-provider'")
  })

  it('excludes mocks and provider when mock is disabled', () => {
    const output = generateIndexFile({ mock: false })

    expect(output).toContain("export * from './types'")
    expect(output).toContain("export * from './hooks'")
    expect(output).not.toContain("mocks")
    expect(output).not.toContain("test-mode-provider")
  })

  it('excludes provider when includeProvider is false', () => {
    const output = generateIndexFile({ mock: true, includeProvider: false })

    expect(output).toContain("export * from './mocks'")
    expect(output).not.toContain("test-mode-provider")
  })

  it('includes auto-generated headers', () => {
    const output = generateIndexFile()

    expect(output).toContain('/* eslint-disable */')
    expect(output).toContain('auto-generated')
  })
})

describe('generateRootIndexFile', () => {
  it('re-exports all tag slugs', () => {
    const output = generateRootIndexFile(['users', 'pets'], { mock: true })

    expect(output).toContain("export * from './users'")
    expect(output).toContain("export * from './pets'")
    expect(output).toContain("export * from './test-mode-provider'")
  })

  it('excludes provider when mock is disabled', () => {
    const output = generateRootIndexFile(['users'], { mock: false })

    expect(output).toContain("export * from './users'")
    expect(output).not.toContain("test-mode-provider")
  })

  it('includes auto-generated headers', () => {
    const output = generateRootIndexFile(['users'])

    expect(output).toContain('/* eslint-disable */')
    expect(output).toContain('auto-generated')
  })
})
```

**Step 2: Run tests to verify they pass**

Run: `bun test tests/generators/index-file.test.ts`
Expected: All 6 tests PASS

**Step 3: Commit**

```bash
git add tests/generators/index-file.test.ts
git commit -m "test: add tests for generateIndexFile and generateRootIndexFile"
```

---

### Task 5: Write tests for generateApiFetch

**Files:**
- Create: `tests/generators/api-fetch.test.ts`

**Step 1: Write the test file**

```typescript
import { describe, it, expect } from 'vitest'
import { generateApiFetch } from '../../src/generators/api-fetch'

describe('generateApiFetch', () => {
  it('generates apiFetch function', () => {
    const output = generateApiFetch()

    expect(output).toContain('export function apiFetch')
    expect(output).toContain('fetch(path')
    expect(output).toContain('Content-Type')
    expect(output).toContain('application/json')
  })

  it('includes error handling', () => {
    const output = generateApiFetch()

    expect(output).toContain('if (!res.ok)')
    expect(output).toContain('throw new Error')
  })

  it('includes auto-generated headers', () => {
    const output = generateApiFetch()

    expect(output).toContain('/* eslint-disable */')
    expect(output).toContain('auto-generated')
  })
})
```

**Step 2: Run tests to verify they pass**

Run: `bun test tests/generators/api-fetch.test.ts`
Expected: All 3 tests PASS

**Step 3: Commit**

```bash
git add tests/generators/api-fetch.test.ts
git commit -m "test: add tests for generateApiFetch"
```

---

### Task 6: Run Full Test Suite

**Files:** (none — verification only)

**Step 1: Run all tests**

Run: `bun test`
Expected: All tests pass (original 56 + 9 new = 65 tests)

**Step 2: Run typecheck**

Run: `bun run typecheck`
Expected: No errors
