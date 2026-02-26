import { describe, it, expect, afterAll, beforeAll } from 'vitest'
import { createServer, type Server } from 'http'
import { discoverSpec, WELL_KNOWN_PATHS } from '../src/discover'

describe('discoverSpec', () => {
  let server: Server
  let baseUrl: string

  beforeAll(async () => {
    server = createServer((req, res) => {
      if (req.url === '/v3/api-docs') {
        res.writeHead(200, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ openapi: '3.0.3', info: { title: 'Test', version: '1.0' }, paths: {} }))
      } else if (req.url === '/swagger.json') {
        res.writeHead(200, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ swagger: '2.0', info: { title: 'Test', version: '1.0' }, paths: {} }))
      } else {
        res.writeHead(404)
        res.end('Not Found')
      }
    })

    await new Promise<void>((resolve) => {
      server.listen(0, '127.0.0.1', () => {
        const addr = server.address()
        if (addr && typeof addr === 'object') {
          baseUrl = `http://127.0.0.1:${addr.port}`
        }
        resolve()
      })
    })
  })

  afterAll(() => {
    server?.close()
  })

  it('discovers OpenAPI 3.x spec at first matching path', async () => {
    const result = await discoverSpec(baseUrl)
    expect(result.url).toBe(`${baseUrl}/v3/api-docs`)
    expect(result.version).toBe('openapi3')
  })

  it('discovers Swagger 2.0 spec when only swagger.json is available', async () => {
    // Create a server that only serves /swagger.json
    const swaggerServer = createServer((req, res) => {
      if (req.url === '/swagger.json') {
        res.writeHead(200, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ swagger: '2.0', info: { title: 'Test', version: '1.0' }, paths: {} }))
      } else {
        res.writeHead(404)
        res.end('Not Found')
      }
    })

    const swaggerBaseUrl = await new Promise<string>((resolve) => {
      swaggerServer.listen(0, '127.0.0.1', () => {
        const addr = swaggerServer.address()
        if (addr && typeof addr === 'object') {
          resolve(`http://127.0.0.1:${addr.port}`)
        }
      })
    })

    try {
      const result = await discoverSpec(swaggerBaseUrl)
      expect(result.url).toBe(`${swaggerBaseUrl}/swagger.json`)
      expect(result.version).toBe('swagger2')
    } finally {
      swaggerServer.close()
    }
  })

  it('throws when no spec is found at any well-known path', async () => {
    // Create a server that returns 404 for everything
    const emptyServer = createServer((_req, res) => {
      res.writeHead(404)
      res.end('Not Found')
    })

    const emptyBaseUrl = await new Promise<string>((resolve) => {
      emptyServer.listen(0, '127.0.0.1', () => {
        const addr = emptyServer.address()
        if (addr && typeof addr === 'object') {
          resolve(`http://127.0.0.1:${addr.port}`)
        }
      })
    })

    try {
      await expect(discoverSpec(emptyBaseUrl)).rejects.toThrow('Could not find an API spec')
    } finally {
      emptyServer.close()
    }
  })

  it('strips trailing slash from base URL', async () => {
    const result = await discoverSpec(`${baseUrl}/`)
    expect(result.url).toBe(`${baseUrl}/v3/api-docs`)
  })

  it('discovers spec from YAML response', async () => {
    const yamlServer = createServer((req, res) => {
      if (req.url === '/openapi.json') {
        res.writeHead(200, { 'Content-Type': 'text/yaml' })
        res.end('openapi: "3.0.3"\ninfo:\n  title: Test\n  version: "1.0"\npaths: {}')
      } else {
        res.writeHead(404)
        res.end('Not Found')
      }
    })

    const yamlBaseUrl = await new Promise<string>((resolve) => {
      yamlServer.listen(0, '127.0.0.1', () => {
        const addr = yamlServer.address()
        if (addr && typeof addr === 'object') {
          resolve(`http://127.0.0.1:${addr.port}`)
        }
      })
    })

    try {
      const result = await discoverSpec(yamlBaseUrl)
      expect(result.url).toBe(`${yamlBaseUrl}/openapi.json`)
      expect(result.version).toBe('openapi3')
    } finally {
      yamlServer.close()
    }
  })

  it('skips 200 responses with invalid content', async () => {
    const invalidServer = createServer((req, res) => {
      if (req.url === '/v3/api-docs') {
        res.writeHead(200, { 'Content-Type': 'text/html' })
        res.end('<html><body>Not a spec</body></html>')
      } else if (req.url === '/swagger.json') {
        res.writeHead(200, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ swagger: '2.0', info: { title: 'Test', version: '1.0' }, paths: {} }))
      } else {
        res.writeHead(404)
        res.end('Not Found')
      }
    })

    const invalidBaseUrl = await new Promise<string>((resolve) => {
      invalidServer.listen(0, '127.0.0.1', () => {
        const addr = invalidServer.address()
        if (addr && typeof addr === 'object') {
          resolve(`http://127.0.0.1:${addr.port}`)
        }
      })
    })

    try {
      const result = await discoverSpec(invalidBaseUrl)
      expect(result.url).toBe(`${invalidBaseUrl}/swagger.json`)
      expect(result.version).toBe('swagger2')
    } finally {
      invalidServer.close()
    }
  })

  it('exports the well-known paths list', () => {
    expect(WELL_KNOWN_PATHS).toEqual([
      '/v3/api-docs',
      '/swagger.json',
      '/openapi.json',
      '/api-docs',
      '/docs/openapi.json',
    ])
  })
})
