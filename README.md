# apigen-tanstack

[![npm version](https://img.shields.io/npm/v/apigen-tanstack)](https://www.npmjs.com/package/apigen-tanstack)
[![CI](https://github.com/ducdmdev/apigen/actions/workflows/release.yml/badge.svg)](https://github.com/ducdmdev/apigen/actions)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)

Generate TanStack Query v5 React hooks from OpenAPI/Swagger specs with built-in test mode.

## Quick Example

```tsx
import { useListPets, useCreatePet } from './api/generated'

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

## Features

- **Type-safe hooks** — `useQuery` for GET, `useMutation` for POST/PUT/PATCH/DELETE
- **TypeScript types** — interfaces generated from OpenAPI schemas
- **Mock data + test mode** — static mocks and a React context provider to toggle them on
- **Swagger 2.0 support** — auto-converted to OpenAPI 3.x
- **Flat or split output** — single directory or split by API tag with `--split`

## Install

```bash
npm install -D apigen-tanstack
```

## Usage

```bash
npx apigen-tanstack generate --input ./openapi.yaml --output ./src/api/generated
```

## Generated Files

| File | Description |
|------|-------------|
| `types.ts` | TypeScript interfaces from schemas |
| `hooks.ts` | `useQuery` / `useMutation` hooks per endpoint |
| `mocks.ts` | Static mock data from schemas |
| `test-mode-provider.tsx` | React context for toggling mock mode |
| `index.ts` | Barrel re-exports |

## Test Mode

Wrap your app with the provider to return mock data instead of real API calls:

```tsx
import { ApiTestModeProvider } from './api/generated'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

const queryClient = new QueryClient()

<QueryClientProvider client={queryClient}>
  <ApiTestModeProvider enabled={true}>
    <App />
  </ApiTestModeProvider>
</QueryClientProvider>
```

## Documentation

- [Getting Started](docs/getting-started.md) — Installation, quick start, and first code generation
- [Configuration](docs/configuration.md) — Config file reference and CLI flags
- [Generated Output](docs/generated-output.md) — File-by-file walkthrough of what apigen produces
- [Architecture](docs/architecture.md) — Pipeline design, IR spec, and generator internals
- [API Reference](docs/api-reference.md) — Public API for programmatic usage
- [Contributing](docs/contributing.md) — Development setup, project structure, and how to extend

## License

MIT
