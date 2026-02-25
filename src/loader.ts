import { readFileSync } from 'fs'
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

async function loadSpec(filePath: string): Promise<Record<string, unknown>> {
  const raw = readFileSync(filePath, 'utf8')
  const parsed = filePath.endsWith('.json') ? JSON.parse(raw) : parseYaml(raw)
  const version = detectSpecVersion(parsed)

  if (version === 'unknown') {
    throw new Error(`Unrecognized spec format in ${filePath}`)
  }

  if (version === 'swagger2') {
    const result = await converter.convertObj(parsed, { patch: true, warnOnly: true })
    return result.openapi as Record<string, unknown>
  }

  const config = await createConfig({})
  const result = await bundle({ ref: filePath, config })
  return result.bundle.parsed as Record<string, unknown>
}

export { loadSpec, detectSpecVersion }
export type { SpecVersion }
