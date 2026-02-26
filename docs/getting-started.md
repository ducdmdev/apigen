# Getting Started

Generate type-safe TanStack Query hooks from your OpenAPI/Swagger specs in under 3 minutes.

## Prerequisites

- **Node.js** >= 18
- **bun** (used for building the package)
- A consuming project with:
  - `react` ^18 or ^19
  - `@tanstack/react-query` ^5

## Install

```bash
npm install --save-dev apigen
```

## Generate from a Spec

### CLI usage

```bash
# From a local file
npx apigen generate --input ./openapi.yaml --output ./src/api/generated

# From a URL
npx apigen generate -i https://api.example.com/openapi.json

# From a config file (auto-searches for apigen.config.ts if --config is omitted)
npx apigen generate --config apigen.config.ts

# Interactive mode (omit flags to be guided through setup)
npx apigen generate

# Preview without writing
npx apigen generate -i ./openapi.yaml --dry-run
```

That reads your OpenAPI 3.x or Swagger 2.0 spec (YAML or JSON, local file or URL), and writes generated files to `./src/api/generated`.

When `-i` is omitted and no config file is found, an interactive wizard guides you through: local file path, direct URL, or auto-discover from a base URL — then prompts for output directory, mock/split options, and optionally saves your choices as `apigen.config.ts`.

### Config file

Create an `apigen.config.ts` in your project root for repeatable generation:

```ts
import { defineConfig } from 'apigen-tanstack'

export default defineConfig({
  input: './specs/petstore.yaml',
  output: './src/api/generated',
  mock: true,
  split: false,
  baseURL: 'https://api.example.com',
})
```

The CLI auto-discovers this file. Use `--config <path>` to point to a different location. CLI flags override config file values.

## Generated Output Structure

### Flat output (default)

```
src/api/generated/
  index.ts                 # Re-exports everything
  types.ts                 # TypeScript interfaces from schema definitions + param types
  hooks.ts                 # useQuery / useMutation hooks per operation
  mocks.ts                 # Mock data for every schema and response (when mock enabled)
  test-mode-provider.tsx   # React context to toggle mock mode (when mock enabled)
```

### Split output (`--split`)

```
src/api/generated/
  index.ts                 # Re-exports all feature folders
  test-mode-provider.tsx   # Shared provider (when mock enabled)
  pets/
    types.ts               # Types for pet operations only
    hooks.ts               # Hooks for pet operations only
    mocks.ts               # Mocks for pet operations only (when mock enabled)
    index.ts               # Barrel for this feature
  users/
    ...
```

Use `--split` to organize output by API tag into per-feature folders.

### What each file does

| File | Purpose |
|------|---------|
| `types.ts` | One interface per schema (`User`, `Pet`, etc.) and per param set (`GetPetByIdParams`) |
| `hooks.ts` | One hook per operation — `useQuery` for GET, `useMutation` for POST/PUT/PATCH/DELETE |
| `mocks.ts` | Realistic default values for every schema, used automatically in test mode |
| `test-mode-provider.tsx` | `<ApiTestModeProvider enabled>` wraps your tree to return mock data instead of fetching |
| `index.ts` | Barrel export — import everything from one path |

## Quick Example

Given a spec with a `GET /pets` endpoint that returns `Pet[]` and a `POST /pets` that accepts a `Pet` body, apigen generates:

### Use in a React component

```tsx
import { useListPets, useCreatePet } from './src/api/generated'

function PetList() {
  const { data: pets, isLoading } = useListPets()
  const createPet = useCreatePet()

  if (isLoading) return <div>Loading...</div>

  return (
    <div>
      <ul>
        {pets?.map(pet => (
          <li key={pet.id}>{pet.name}</li>
        ))}
      </ul>
      <button onClick={() => createPet.mutate({ name: 'Buddy' })}>
        Add Pet
      </button>
    </div>
  )
}
```

### Use mock mode in tests

Wrap your component with `ApiTestModeProvider` to skip real network calls:

```tsx
import { ApiTestModeProvider } from './src/api/generated'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

const queryClient = new QueryClient()

function TestWrapper({ children }: { children: React.ReactNode }) {
  return (
    <QueryClientProvider client={queryClient}>
      <ApiTestModeProvider enabled={true}>
        {children}
      </ApiTestModeProvider>
    </QueryClientProvider>
  )
}
```

When `enabled` is `true`, every generated hook returns mock data from `mocks.ts` instead of making fetch calls.

## Supported Spec Formats

- **OpenAPI 3.x** (YAML or JSON)
- **Swagger 2.0** (automatically converted to OpenAPI 3 via `swagger2openapi`)
- **allOf composition** — schemas using `allOf` are merged into flat interfaces

Specs with `$ref` references (including circular references) are bundled and resolved automatically via `@redocly/openapi-core`.

## Next Steps

- See [Configuration](./configuration.md) for all available options and CLI flags.
