import { describe, it, expect } from 'vitest'
import { resolve } from 'path'
import { loadSpec } from '../../src/loader'
import { extractIR } from '../../src/ir'
import { generateHooks } from '../../src/generators/hooks'

describe('generateHooks', () => {
  it('generates useQuery hook for GET endpoints', async () => {
    const spec = await loadSpec(resolve(__dirname, '../fixtures/petstore-oas3.yaml'))
    const ir = extractIR(spec)
    const output = generateHooks(ir)

    expect(output).toContain('export function useListPets')
    expect(output).toContain('useQuery')
    expect(output).toContain("queryKey: ['pets']")
  })

  it('generates useMutation hook for POST endpoints', async () => {
    const spec = await loadSpec(resolve(__dirname, '../fixtures/petstore-oas3.yaml'))
    const ir = extractIR(spec)
    const output = generateHooks(ir)

    expect(output).toContain('export function useCreatePet')
    expect(output).toContain('useMutation')
  })

  it('generates hook with path params', async () => {
    const spec = await loadSpec(resolve(__dirname, '../fixtures/petstore-oas3.yaml'))
    const ir = extractIR(spec)
    const output = generateHooks(ir)

    expect(output).toContain('export function useGetPet')
    expect(output).toContain('params: GetPetParams')
    expect(output).toContain("queryKey: ['pets', params.petId]")
  })

  it('includes test mode toggle', async () => {
    const spec = await loadSpec(resolve(__dirname, '../fixtures/petstore-oas3.yaml'))
    const ir = extractIR(spec)
    const output = generateHooks(ir)

    expect(output).toContain('useApiTestMode')
    expect(output).toContain('testMode')
    expect(output).toContain('mockListPetsResponse')
  })

  it('imports from tanstack query', async () => {
    const spec = await loadSpec(resolve(__dirname, '../fixtures/petstore-oas3.yaml'))
    const ir = extractIR(spec)
    const output = generateHooks(ir)

    expect(output).toContain("from '@tanstack/react-query'")
    expect(output).toContain("from './test-mode-provider'")
    expect(output).toContain("from './mocks'")
    expect(output).toContain("from './types'")
  })

  it('omits mock imports and test mode when mock is false', async () => {
    const spec = await loadSpec(resolve(__dirname, '../fixtures/petstore-oas3.yaml'))
    const ir = extractIR(spec)
    const output = generateHooks(ir, { mock: false })

    expect(output).toContain("from '@tanstack/react-query'")
    expect(output).toContain("from './types'")
    expect(output).not.toContain("from './test-mode-provider'")
    expect(output).not.toContain("from './mocks'")
    expect(output).not.toContain('useApiTestMode')
    expect(output).not.toContain('testMode')
    expect(output).toContain('apiFetch')
  })
})
