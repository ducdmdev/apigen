import { parse as parseYaml } from 'yaml'
import { detectSpecVersion } from './loader'
import type { SpecVersion } from './loader'

const WELL_KNOWN_PATHS = [
  '/v3/api-docs',
  '/swagger.json',
  '/openapi.json',
  '/api-docs',
  '/docs/openapi.json',
] as const

interface DiscoverResult {
  url: string
  version: SpecVersion
}

async function discoverSpec(baseUrl: string): Promise<DiscoverResult> {
  const normalizedBase = baseUrl.replace(/\/+$/, '')
  const tried: string[] = []

  for (const path of WELL_KNOWN_PATHS) {
    const url = `${normalizedBase}${path}`
    tried.push(url)

    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(3000) })
      if (!response.ok) continue

      const text = await response.text()
      let parsed: Record<string, unknown>
      try {
        parsed = JSON.parse(text)
      } catch {
        parsed = parseYaml(text) as Record<string, unknown>
      }

      const version = detectSpecVersion(parsed)
      if (version !== 'unknown') {
        return { url, version }
      }
    } catch {
      continue
    }
  }

  throw new Error(
    `Could not find an API spec at ${normalizedBase}. Tried:\n${tried.map((u) => `  - ${u}`).join('\n')}`
  )
}

export { discoverSpec, WELL_KNOWN_PATHS }
export type { DiscoverResult }
