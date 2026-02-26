import { existsSync, readFileSync } from 'fs'
import { parse as parseYaml } from 'yaml'
import { bundle, createConfig } from '@redocly/openapi-core'
import converter from 'swagger2openapi'

type SpecVersion = 'swagger2' | 'openapi3' | 'unknown'

function detectSpecVersion(spec: Record<string, unknown>): SpecVersion {
  if (typeof spec.swagger === 'string' && spec.swagger.startsWith('2.')) {
    return 'swagger2'
  }
  if (typeof spec.openapi === 'string' && spec.openapi.startsWith('3.')) {
    return 'openapi3'
  }
  return 'unknown'
}

function isUrl(input: string): boolean {
  return input.startsWith('http://') || input.startsWith('https://')
}

async function loadSpecFromUrl(url: string): Promise<Record<string, unknown>> {
  const response = await fetch(url)
  if (!response.ok) {
    throw new Error(`Failed to fetch spec from ${url}: ${response.status} ${response.statusText}`)
  }

  const text = await response.text()

  let parsed: Record<string, unknown>
  try {
    parsed = JSON.parse(text)
  } catch {
    parsed = parseYaml(text) as Record<string, unknown>
  }

  const version = detectSpecVersion(parsed)

  if (version === 'unknown') {
    throw new Error(`Unrecognized spec format from ${url}`)
  }

  if (version === 'swagger2') {
    const result = await converter.convertObj(parsed, { patch: true, warnOnly: true })
    return result.openapi as Record<string, unknown>
  }

  return parsed
}

async function loadSpec(input: string): Promise<Record<string, unknown>> {
  if (isUrl(input)) {
    return loadSpecFromUrl(input)
  }

  if (!existsSync(input)) {
    throw new Error(`Cannot find spec file: ${input}. Check the path and try again.`)
  }

  const raw = readFileSync(input, 'utf8')

  let parsed: Record<string, unknown>
  try {
    parsed = input.endsWith('.json') ? JSON.parse(raw) : parseYaml(raw)
  } catch (err) {
    throw new Error(`Failed to parse ${input}: ${(err as Error).message}`)
  }

  const version = detectSpecVersion(parsed)

  if (version === 'unknown') {
    throw new Error(`Unrecognized spec format in ${input}. Expected OpenAPI 3.x or Swagger 2.0.`)
  }

  if (version === 'swagger2') {
    const result = await converter.convertObj(parsed, { patch: true, warnOnly: true })
    return result.openapi as Record<string, unknown>
  }

  const config = await createConfig({})
  const result = await bundle({ ref: input, config })
  return result.bundle.parsed as Record<string, unknown>
}

export { loadSpec, detectSpecVersion, isUrl }
export type { SpecVersion }
