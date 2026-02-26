interface Config {
  input: string
  output: string
  mock: boolean
  split: boolean
  baseURL?: string
  apiFetchImportPath?: string
}

interface ConfigInput {
  input: string
  output?: string
  mock?: boolean
  split?: boolean
  baseURL?: string
  apiFetchImportPath?: string
}

function defineConfig(config: ConfigInput): Config {
  return resolveConfig(config)
}

function resolveConfig(input: ConfigInput): Config {
  return {
    input: input.input,
    output: input.output ?? './src/api/generated',
    mock: input.mock ?? true,
    split: input.split ?? false,
    baseURL: input.baseURL,
    apiFetchImportPath: input.apiFetchImportPath,
  }
}

export { defineConfig, resolveConfig }
export type { Config, ConfigInput }
