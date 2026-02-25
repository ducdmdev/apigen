interface Config {
  input: string
  output: string
  mock: boolean
}

interface ConfigInput {
  input: string
  output?: string
  mock?: boolean
}

function defineConfig(config: ConfigInput): Config {
  return resolveConfig(config)
}

function resolveConfig(input: ConfigInput): Config {
  return {
    input: input.input,
    output: input.output ?? './src/api/generated',
    mock: input.mock ?? true,
  }
}

export { defineConfig, resolveConfig }
export type { Config, ConfigInput }
