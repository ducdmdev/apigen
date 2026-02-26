# Interactive Spec Source Selection

**Date**: 2026-02-26
**Status**: Approved

## Problem

When a user runs `apigen generate` without the `-i` flag, the CLI errors out. Users should instead be guided through choosing how to provide their API spec.

## Design

### CLI Flow

Change `-i` from `requiredOption` to `option`. When omitted, show an interactive prompt:

```
? How would you like to provide your API spec?
❯ Local file path
  Direct URL to spec
  Auto-discover from base URL
```

Each choice leads to a follow-up `input()` prompt for the path or URL. When `-i` is provided, the prompt is skipped entirely — no breaking change to existing usage.

### Source Options

1. **Local file path** — user enters a path to a `.yaml` or `.json` file
2. **Direct URL** — user enters a full URL to the spec endpoint
3. **Auto-discover** — user enters a base URL (e.g. `http://localhost:8080`), the tool tries well-known paths

### Auto-Discovery

New `src/discover.ts` with:

```ts
discoverSpec(baseUrl: string): Promise<{ url: string; version: SpecVersion }>
```

Well-known paths tried in order:
1. `/v3/api-docs` — Spring Boot (SpringDoc)
2. `/swagger.json` — Swagger UI / Express swagger-jsdoc
3. `/openapi.json` — Common convention
4. `/api-docs` — Older Spring Boot (Springfox)
5. `/docs/openapi.json` — FastAPI

Each path is fetched with a 3-second timeout. The response is parsed as JSON/YAML and validated with `detectSpecVersion()` (reused from `loader.ts`). First valid response wins. If all fail, an error lists every path tried.

### Dependencies

- Add `@inquirer/prompts` as a `dependency` (needed at runtime since CLI is the shipped artifact)

### Files Changed

| File | Change |
|------|--------|
| `src/cli.ts` | Make `-i` optional, add `promptForInput()` using `@inquirer/prompts` |
| `src/discover.ts` | New — `discoverSpec()` function |
| `package.json` | Add `@inquirer/prompts` |
| `tests/discover.test.ts` | New — unit tests for discovery logic |

### Testing

- **discover.ts**: Mock `fetch` to test success path, fallback order, timeout, and all-fail case
- **Existing tests**: Unchanged — all use `-i` directly
- **Interactive prompt**: Not auto-tested (thin wrapper over `@inquirer/prompts`)
