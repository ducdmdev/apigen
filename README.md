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
