# apigen

Generate TanStack Query v5 React hooks from OpenAPI/Swagger specs with built-in test mode.

## Install

```bash
npm install -D apigen
```

## Usage

```bash
npx apigen generate --input ./openapi.yaml --output ./src/api/generated
```

## Generated Files

- `types.ts` — TypeScript interfaces from schemas
- `hooks.ts` — useQuery/useMutation hooks per endpoint
- `mocks.ts` — Static mock data from schemas
- `test-mode-provider.tsx` — React context for toggling mock mode
- `index.ts` — Re-exports

## Test Mode

Wrap your app with the provider to use mock data instead of real API calls:

```tsx
import { ApiTestModeProvider } from './api/generated'

<ApiTestModeProvider enabled={true}>
  <App />
</ApiTestModeProvider>
```

## Supported Specs

- OpenAPI 3.0+
- Swagger 2.0 (auto-converted to OpenAPI 3.0)

## Documentation

- [Getting Started](docs/getting-started.md) — Installation, quick start, and first code generation
- [Configuration](docs/configuration.md) — Config file reference and CLI flags
- [Generated Output](docs/generated-output.md) — File-by-file walkthrough of what apigen produces
- [Architecture](docs/architecture.md) — Pipeline design, IR spec, and generator internals
- [API Reference](docs/api-reference.md) — Public API for programmatic usage
- [Contributing](docs/contributing.md) — Development setup, project structure, and how to extend
