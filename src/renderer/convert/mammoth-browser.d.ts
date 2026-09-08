declare module 'mammoth/mammoth.browser' {
  interface MammothResult {
    value: string
    messages: unknown[]
  }
  export function convertToHtml(input: { arrayBuffer: ArrayBuffer }): Promise<MammothResult>
  export function extractRawText(input: { arrayBuffer: ArrayBuffer }): Promise<MammothResult>
  const _default: { convertToHtml: typeof convertToHtml; extractRawText: typeof extractRawText }
  export default _default
}
