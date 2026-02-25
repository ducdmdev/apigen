declare module 'swagger2openapi' {
  interface ConvertOptions {
    patch?: boolean
    warnOnly?: boolean
  }

  interface ConvertResult {
    openapi: Record<string, unknown>
  }

  function convertObj(
    swagger: Record<string, unknown>,
    options: ConvertOptions
  ): Promise<ConvertResult>

  export default { convertObj }
}
