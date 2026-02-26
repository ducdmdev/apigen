import { describe, it, expect, afterAll } from 'vitest'
import { resolve } from 'path'
import { readFileSync } from 'fs'
import { createServer, type Server } from 'http'
import { loadSpec, detectSpecVersion, isUrl } from '../src/loader'

describe('detectSpecVersion', () => {
  it('detects swagger 2.0', () => {
    expect(detectSpecVersion({ swagger: '2.0' })).toBe('swagger2')
  })

  it('detects openapi 3.0', () => {
    expect(detectSpecVersion({ openapi: '3.0.3' })).toBe('openapi3')
  })

  it('returns unknown for unrecognized', () => {
    expect(detectSpecVersion({})).toBe('unknown')
  })
})

describe('isUrl', () => {
  it('returns true for http URLs', () => {
    expect(isUrl('http://example.com/openapi.json')).toBe(true)
  })

  it('returns true for https URLs', () => {
    expect(isUrl('https://api.example.com/v3/openapi.yaml')).toBe(true)
  })

  it('returns false for file paths', () => {
    expect(isUrl('./specs/petstore.yaml')).toBe(false)
    expect(isUrl('/absolute/path/spec.json')).toBe(false)
    expect(isUrl('relative/path.yaml')).toBe(false)
  })
})

describe('loadSpec', () => {
  it('loads OpenAPI 3.0 spec', async () => {
    const spec = await loadSpec(resolve(__dirname, 'fixtures/petstore-oas3.yaml'))
    expect(spec.openapi).toMatch(/^3\./)
    expect(spec.paths['/pets']).toBeDefined()
    expect(spec.components?.schemas?.Pet).toBeDefined()
  })

  it('loads and converts Swagger 2.0 spec to OpenAPI 3.0', async () => {
    const spec = await loadSpec(resolve(__dirname, 'fixtures/petstore-swagger2.yaml'))
    expect(spec.openapi).toMatch(/^3\./)
    expect(spec.paths['/pets']).toBeDefined()
  })
})

describe('loadSpec from URL', () => {
  let server: Server
  let baseUrl: string

  const fixturePath = resolve(__dirname, 'fixtures/petstore-oas3.yaml')
  const fixtureContent = readFileSync(fixturePath, 'utf8')

  // Start a local HTTP server serving the fixture
  const startServer = () =>
    new Promise<void>((resolve) => {
      server = createServer((req, res) => {
        if (req.url === '/spec.yaml') {
          res.writeHead(200, { 'Content-Type': 'text/yaml' })
          res.end(fixtureContent)
        } else if (req.url === '/spec.json') {
          const { parse } = require('yaml')
          const parsed = parse(fixtureContent)
          res.writeHead(200, { 'Content-Type': 'application/json' })
          res.end(JSON.stringify(parsed))
        } else if (req.url === '/not-found') {
          res.writeHead(404)
          res.end('Not Found')
        } else {
          res.writeHead(400)
          res.end('Bad Request')
        }
      })
      server.listen(0, '127.0.0.1', () => {
        const addr = server.address()
        if (addr && typeof addr === 'object') {
          baseUrl = `http://127.0.0.1:${addr.port}`
        }
        resolve()
      })
    })

  it('loads OpenAPI spec from a YAML URL', async () => {
    await startServer()
    const spec = await loadSpec(`${baseUrl}/spec.yaml`)
    expect(spec.openapi).toMatch(/^3\./)
    expect(spec.paths['/pets']).toBeDefined()
    expect(spec.components?.schemas?.Pet).toBeDefined()
  })

  it('loads OpenAPI spec from a JSON URL', async () => {
    const spec = await loadSpec(`${baseUrl}/spec.json`)
    expect(spec.openapi).toMatch(/^3\./)
    expect(spec.paths['/pets']).toBeDefined()
  })

  it('throws on HTTP error response', async () => {
    await expect(loadSpec(`${baseUrl}/not-found`)).rejects.toThrow('Failed to fetch spec')
  })

  afterAll(() => {
    server?.close()
  })
})
